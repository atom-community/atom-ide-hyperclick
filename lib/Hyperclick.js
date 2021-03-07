/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 *  strict-local
 * @format
 */

const SuggestionList = require("./SuggestionList")
const HyperclickForTextEditor = require("./HyperclickForTextEditor")
const { Disposable, CompositeDisposable } = require("atom")
const { wordAtPosition } = require("atom-ide-base/commons-atom/range")
const { ProviderRegistry } = require("atom-ide-base/commons-atom/ProviderRegistry")

/**
 * Construct this object to enable Hyperclick in the Atom workspace.
 * Call `dispose` to disable the feature.
 */
class Hyperclick {
  constructor() {
    this._providers = new ProviderRegistry()
    this._suggestionList = new SuggestionList()
    this._hyperclickForTextEditors = new Set()
    this._textEditorSubscription = atom.workspace.observeTextEditors(this.observeTextEditor.bind(this))
  }

  observeTextEditor(textEditor) {
    const hyperclickForTextEditor = new HyperclickForTextEditor(textEditor, this)

    this._hyperclickForTextEditors.add(hyperclickForTextEditor)

    const disposable = new Disposable(() => {
      hyperclickForTextEditor.dispose()

      this._hyperclickForTextEditors.delete(hyperclickForTextEditor)
    })
    return new CompositeDisposable(
      textEditor.onDidDestroy(() => disposable.dispose()),
      disposable
    )
  }

  dispose() {
    this._suggestionList.hide()

    this._textEditorSubscription.dispose()

    this._hyperclickForTextEditors.forEach((hyperclick) => hyperclick.dispose())

    this._hyperclickForTextEditors.clear()
  }

  addProvider(provider) {
    if (Array.isArray(provider)) {
      return new CompositeDisposable(...provider.map((p) => this._providers.addProvider(p)))
    }

    return this._providers.addProvider(provider)
  }

  /**
   * Returns the first suggestion from the consumed providers.
   */
  async getSuggestion(textEditor, position) {
    for (const provider of this._providers.getAllProvidersForEditor(textEditor)) {
      let result

      if (provider.getSuggestion) {
        // eslint-disable-next-line no-await-in-loop
        result = await provider.getSuggestion(textEditor, position)
        console.log(provider.getSuggestion.calls.all())
      } else if (provider.getSuggestionForWord) {
        const match = wordAtPosition(textEditor, position, provider.wordRegExp)

        if (!match) {
          continue
        }

        const { wordMatch, range } = match

        // eslint-disable-next-line no-await-in-loop
        result = await provider.getSuggestionForWord(textEditor, wordMatch[0], range)
      } else {
        throw new Error("Hyperclick must have either `getSuggestion` or `getSuggestionForWord`")
      }

      if (result) {
        return result
      }
    }
  }

  showSuggestionList(textEditor, suggestion) {
    this._suggestionList.show(textEditor, suggestion)
  }
}

module.exports = Hyperclick
