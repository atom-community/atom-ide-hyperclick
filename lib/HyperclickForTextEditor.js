/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 *
 * @format
 */

const { Point, CompositeDisposable, Disposable } = require("atom")
const { isPositionInRange, wordAtPosition } = require("atom-ide-base/commons-atom/range")
const showTriggerConflictWarning = require("./showTriggerConflictWarning")
const RxJS = require("rxjs")
const RxOp = require("rxjs/operators")

const WARN_ABOUT_TRIGGER_CONFLICT_KEY = "atom-ide-hyperclick.warnAboutTriggerConflict"
const LOADING_DELAY = 250
/**
 * Construct this object to enable Hyperclick in a text editor.
 * Call `dispose` to disable the feature.
 */

class HyperclickForTextEditor {
  // A central "event bus" for all fetch events.
  // TODO: Rx-ify all incoming events to avoid using a subject.
  // Stored for testing.
  constructor(textEditor, hyperclick) {
    this._textEditor = textEditor
    this._textEditorView = atom.views.getView(textEditor)
    this._hyperclick = hyperclick
    this._lastMouseEvent = null

    // Cache the most recent suggestion so we can avoid unnecessary fetching.
    this._lastSuggestionAtMouse = null
    this._navigationMarkers = null
    this._lastWordRange = null
    this._subscriptions = new CompositeDisposable()
    this._onMouseMove = this._onMouseMove.bind(this)
    this._onMouseDown = this._onMouseDown.bind(this)

    this._setupMouseListeners()

    this._onKeyDown = this._onKeyDown.bind(this)

    this._textEditorView.addEventListener("keydown", this._onKeyDown)

    this._onKeyUp = this._onKeyUp.bind(this)

    this._textEditorView.addEventListener("keyup", this._onKeyUp)

    this._onContextMenu = this._onContextMenu.bind(this)

    this._textEditorView.addEventListener("contextmenu", this._onContextMenu)

    this._subscriptions.add(
      atom.commands.add(this._textEditorView, {
        "atom-ide-hyperclick:confirm-cursor": () => this._confirmSuggestionAtCursor(),
      })
    )

    this._isDestroyed = false
    this._fetchStream = new RxJS.Subject()
    this._suggestionStream = this._observeSuggestions().pipe(RxOp.share())

    let configPath = "atom-ide-hyperclick.linuxTriggerKeys"
    if (process.platform === "darwin") {
      configPath = "atom-ide-hyperclick.darwinTriggerKeys"
    }
    if (process.platform === "win32") {
      configPath = "atom-ide-hyperclick.win32TriggerKeys"
    }

    this._subscriptions.add(
      atom.config.observe(configPath, (newValue_) => {
        const newValue = newValue_
        // For all Flow knows, newValue.split could return any old strings
        this._triggerKeys = new Set(newValue.split(","))
      })
    )

    const updateSuggestionSubscription = this._suggestionStream.subscribe((suggestion) =>
      this._updateSuggestion(suggestion)
    )
    this._subscriptions.add(
      new Disposable(() => {
        updateSuggestionSubscription.unsubscribe()
      })
    )
  }

  _setupMouseListeners() {
    const addMouseListeners = () => {
      const { component } = this._textEditorView

      if (!component) {
        throw new Error('Invariant violation: "component"')
      }

      const linesDomNode = component.refs.lineTiles

      if (!linesDomNode) {
        return
      }

      linesDomNode.addEventListener("mousedown", this._onMouseDown)
      linesDomNode.addEventListener("mousemove", this._onMouseMove)
      const removalDisposable = new Disposable(() => {
        linesDomNode.removeEventListener("mousedown", this._onMouseDown)
        linesDomNode.removeEventListener("mousemove", this._onMouseMove)
      })

      this._subscriptions.add(removalDisposable)

      this._subscriptions.add(this._textEditorView.onDidDetach(() => removalDisposable.dispose()))
    }

    if (this._textEditorView.component && this._textEditorView.parentNode) {
      addMouseListeners()
    } else {
      this._subscriptions.add(this._textEditorView.onDidAttach(addMouseListeners))
    }
  }

  _confirmSuggestion(suggestion) {
    if (Array.isArray(suggestion.callback) && suggestion.callback.length > 0) {
      this._hyperclick.showSuggestionList(this._textEditor, suggestion)
    } else {
      if (!(typeof suggestion.callback === "function")) {
        throw new Error("Invariant violation: \"typeof suggestion.callback === 'function'\"")
      }

      suggestion.callback()
    }
  }

  _onContextMenu(event) {
    const mouseEvent = event

    // If the key trigger happens to cause the context menu to show up, then
    // cancel it. By this point, it's too late to know if you're at a suggestion
    // position to be more fine grained. So if your trigger keys are "ctrl+cmd",
    // then you can't use that combination to bring up the context menu.
    if (this._isHyperclickEvent(mouseEvent)) {
      event.stopPropagation()
    }
  }

  _onMouseMove(event) {
    const mouseEvent = event

    // We save the last `MouseEvent` so the user can trigger Hyperclick by
    // pressing the key without moving the mouse again. We only save the
    // relevant properties to prevent retaining a reference to the event.
    this._lastMouseEvent = {
      clientX: mouseEvent.clientX,
      clientY: mouseEvent.clientY,
    }

    if (this._isHyperclickEvent(mouseEvent)) {
      this._fetchSuggestion(mouseEvent)
    } else {
      this._clearSuggestion()
    }
  }

  _onMouseDown(event) {
    const mouseEvent = event

    if (!this._isHyperclickEvent(mouseEvent)) {
      return
    }

    // If hyperclick and multicursor are using the same trigger, prevent multicursor.
    if (isMulticursorEvent(mouseEvent)) {
      mouseEvent.stopPropagation()

      if (localStorage.getItem(WARN_ABOUT_TRIGGER_CONFLICT_KEY) !== "false") {
        localStorage.setItem(WARN_ABOUT_TRIGGER_CONFLICT_KEY, "false")
        showTriggerConflictWarning()
      }
    }

    if (!this._lastMouseEvent) {
      return
    }

    const lastPosition = this._getMousePositionAsBufferPosition(this._lastMouseEvent)

    if (!lastPosition || !this._isInLastSuggestion(lastPosition)) {
      return
    }

    if (this._lastSuggestionAtMouse) {
      const lastSuggestionAtMouse = this._lastSuggestionAtMouse

      // Move the cursor to the click location to force a navigation-stack push.
      this._textEditor.setCursorBufferPosition(lastPosition)

      this._confirmSuggestion(lastSuggestionAtMouse)

      // Prevent the <meta-click> event from adding another cursor.
      event.stopPropagation()
    }

    this._clearSuggestion()
  }

  _onKeyDown(event) {
    const mouseEvent = event

    // Show the suggestion at the last known mouse position.
    if (this._isHyperclickEvent(mouseEvent) && this._lastMouseEvent) {
      this._fetchSuggestion(this._lastMouseEvent)
    }
  }

  _onKeyUp(event) {
    const mouseEvent = event

    if (!this._isHyperclickEvent(mouseEvent)) {
      this._clearSuggestion()
    }
  }

  /**
   * Returns a `Promise` that's resolved when the latest suggestion's available.
   * (Exposed for testing.)
   */
  getSuggestionAtMouse() {
    return this._suggestionStream.take(1).toPromise()
  }

  _fetchSuggestion(mouseEvent) {
    this._fetchStream.next(mouseEvent)
  }

  _observeSuggestions() {
    return this._fetchStream.pipe(
      RxOp.map((mouseEvent) => {
        if (!mouseEvent) {
          return null
        }

        return this._getMousePositionAsBufferPosition(mouseEvent)
      }),
      RxOp.distinctUntilChanged((x, y) => {
        if ((!x && x !== 0) || (!y && y !== 0)) {
          return (!x && x !== 0) === (!y && y !== 0)
        }

        return x.compare(y) === 0
      }),
      RxOp.filter((position) => {
        if (!position) {
          return true
        }

        // Don't fetch suggestions if the mouse is still in the same 'word', where
        // 'word' is defined by the wordRegExp at the current position.
        //
        // If the last suggestion had multiple ranges, we have no choice but to
        // fetch suggestions because the new word might be between those ranges.
        // This should be ok because it will reuse that last suggestion until the
        // mouse moves off of it.
        if (
          (!this._lastSuggestionAtMouse || !Array.isArray(this._lastSuggestionAtMouse.range)) &&
          this._isInLastWordRange(position)
        ) {
          return false
        }

        // Don't refetch if we're already inside the previously emitted suggestion.
        if (this._isInLastSuggestion(position)) {
          return false
        }

        return true
      }),
      RxOp.tap((position) => {
        if (!position) {
          this._lastWordRange = null
        } else {
          const match = wordAtPosition(this._textEditor, position)
          this._lastWordRange = match ? match.range : null
        }
      }),
      RxOp.switchMap((position) => {
        if (!position) {
          return RxJS.of(null)
        }

        return RxJS.using(
          () => this._showLoading(),
          () =>
            RxJS.defer(() => this._hyperclick.getSuggestion(this._textEditor, position)).pipe(
              // Clear the previous suggestion immediately.
              RxOp.startWith(null),
              RxOp.catchError((e) => {
                console.error("atom-ide-hyperclick: Error getting Hyperclick suggestion:", e)
                return RxJS.of(null)
              })
            )
        )
      }),
      RxOp.distinctUntilChanged()
    )
  }

  _updateSuggestion(suggestion) {
    this._lastSuggestionAtMouse = suggestion

    if (suggestion) {
      // Add the hyperclick markers if there's a new suggestion and it's under the mouse.
      this._updateNavigationMarkers(suggestion.range)
    } else {
      // Remove all the markers if we've finished loading and there's no suggestion.
      this._updateNavigationMarkers(null)
    }
  }

  _getMousePositionAsBufferPosition(mouseEvent) {
    const { component } = this._textEditorView

    if (!component) {
      throw new Error('Invariant violation: "component"')
    }

    const screenPosition = component.screenPositionForMouseEvent(mouseEvent)

    const screenLine = this._textEditor.lineTextForScreenRow(screenPosition.row)

    if (screenPosition.column >= screenLine.length) {
      // We shouldn't try to fetch suggestions for trailing whitespace.
      return null
    }

    try {
      return this._textEditor.bufferPositionForScreenPosition(screenPosition)
    } catch (error) {
      // Fix https://github.com/facebook/nuclide/issues/292
      // When navigating Atom workspace with `CMD/CTRL` down,
      // it triggers TextEditorElement's `mousemove` with invalid screen position.
      // This falls back to returning the start of the editor.
      console.error("atom-ide-hyperclick: Error getting buffer position for screen position:", error)
      return new Point(0, 0)
    }
  }

  _isInLastSuggestion(position) {
    if (!this._lastSuggestionAtMouse) {
      return false
    }

    const { range } = this._lastSuggestionAtMouse
    return isPositionInRange(position, range)
  }

  _isInLastWordRange(position) {
    const lastWordRange = this._lastWordRange

    if (!lastWordRange) {
      return false
    }

    return isPositionInRange(position, lastWordRange)
  }

  _clearSuggestion() {
    this._fetchStream.next(null)
  }

  async _confirmSuggestionAtCursor() {
    const suggestion = await this._hyperclick.getSuggestion(
      this._textEditor,
      this._textEditor.getCursorBufferPosition()
    )

    if (suggestion) {
      this._confirmSuggestion(suggestion)
    }
  }

  /**
   * Add markers for the given range(s), or clears them if `ranges` is null.
   */
  _updateNavigationMarkers(range) {
    if (this._navigationMarkers) {
      this._navigationMarkers.forEach((marker) => marker.destroy())

      this._navigationMarkers = null
    }

    // Only change the cursor to a pointer if there is a suggestion ready.
    if (!range) {
      this._textEditorView.classList.remove("atom-ide-hyperclick")

      return
    }

    this._textEditorView.classList.add("atom-ide-hyperclick")

    const ranges = Array.isArray(range) ? range : [range]
    this._navigationMarkers = ranges.map((markerRange) => {
      const marker = this._textEditor.markBufferRange(markerRange, {
        invalidate: "never",
      })

      this._textEditor.decorateMarker(marker, {
        type: "highlight",
        class: "atom-ide-hyperclick",
      })

      return marker
    })
  }

  /**
   * Returns whether an event should be handled by hyperclick or not.
   */
  _isHyperclickEvent(event) {
    return (
      event.shiftKey === this._triggerKeys.has("shiftKey") &&
      event.ctrlKey === this._triggerKeys.has("ctrlKey") &&
      event.altKey === this._triggerKeys.has("altKey") &&
      event.metaKey === this._triggerKeys.has("metaKey")
    )
  }

  // A subscription that encapsulates the cursor loading spinner.
  // There should only be one subscription active at a given time!
  _showLoading() {
    return RxJS.timer(LOADING_DELAY)
      .pipe(
        RxOp.switchMap(() =>
          RxJS.Observable.create(() => {
            this._textEditorView.classList.add("atom-ide-hyperclick-loading")

            return () => {
              this._textEditorView.classList.remove("atom-ide-hyperclick-loading")
            }
          })
        )
      )
      .subscribe()
  }

  dispose() {
    this._isDestroyed = true

    this._clearSuggestion()

    this._textEditorView.removeEventListener("keydown", this._onKeyDown)

    this._textEditorView.removeEventListener("keyup", this._onKeyUp)

    this._textEditorView.removeEventListener("contextmenu", this._onContextMenu)

    this._subscriptions.dispose()
  }
}

/**
 * Determine whether the specified event will trigger Atom's multiple cursors. This is based on (and
 * must be the same as!) [Atom's
 * logic](https://github.com/atom/atom/blob/v1.14.2/src/text-editor-component.coffee#L527).
 */
module.exports = HyperclickForTextEditor

function isMulticursorEvent(event) {
  const { platform } = process
  const isLeftButton = event.button === 0 || (event.button === 1 && platform === "linux")
  const { metaKey, ctrlKey } = event

  if (!isLeftButton) {
    return false
  }

  if (ctrlKey && platform === "darwin") {
    return false
  }

  return metaKey || (ctrlKey && platform !== "darwin")
}
