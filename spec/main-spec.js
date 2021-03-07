const { Range, Point } = require("atom")
const path = require("path")
const hyperclick = require("../lib/main")
const testPackagePath = fixturePath("hyperclick-test-package")
const testPackage = require(testPackagePath)
const triggerKey = process.platform === "darwin" ? "metaKey" : "ctrlKey"

function fixturePath(filePath = "") {
  return path.resolve(__dirname, "./fixtures", filePath)
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms || 0)
  })
}

function mouseEvent(editor, type, options) {
  const { component } = atom.views.getView(editor)
  const linesDomNode = component.refs.lineTiles
  const event = new MouseEvent(type, options)
  linesDomNode.dispatchEvent(event)
  return event
}

function keyEvent(editor, type, options) {
  const editorView = atom.views.getView(editor)
  const event = new KeyboardEvent(type, options)
  editorView.dispatchEvent(event)
  return event
}

describe("main.js", () => {
  beforeEach(() => {
    jasmine.attachToDOM(atom.views.getView(atom.workspace))
    // Trigger deferred activation
    atom.packages.triggerDeferredActivationHooks()
    // Activate activation hook
    atom.packages.triggerActivationHook("core:loaded-shell-environment")
  })

  it("activate", async () => {
    await atom.packages.activatePackage("atom-ide-hyperclick")
    expect(atom.packages.isPackageLoaded("atom-ide-hyperclick")).toBeTruthy()
  })

  it("addProvider", async (done) => {
    const obj = { test: true }
    spyOn(hyperclick, "addProvider").and.callFake((provider) => {
      expect(provider).toBe(obj)
      done()
    })
    spyOn(testPackage, "getProvider").and.returnValue(obj)
    await atom.packages.activatePackage("atom-ide-hyperclick")
    await atom.packages.activatePackage(testPackagePath)
  })

  it("addLegacyProvider", async (done) => {
    const obj = { test: true }
    spyOn(hyperclick, "addLegacyProvider").and.callFake((provider) => {
      expect(provider).toBe(obj)
      done()
    })
    spyOn(testPackage, "getLegacyProvider").and.returnValue(obj)
    await atom.packages.activatePackage("atom-ide-hyperclick")
    await atom.packages.activatePackage(testPackagePath)
  })

  it("observeTextEditor", async (done) => {
    const obj = { test: true }
    spyOn(hyperclick, "observeTextEditor").and.returnValue(obj)
    spyOn(testPackage, "observeTextEditor").and.callFake((provider) => {
      expect(provider).toBe(obj)
      done()
    })
    await atom.packages.activatePackage("atom-ide-hyperclick")
    await atom.packages.activatePackage(testPackagePath)
  })

  it("should add provider for getSuggestionForWord", async () => {
    const callback = jasmine.createSpy("callback")
    const getSuggestionForWord = jasmine
      .createSpy("getSuggestionForWord")
      .and.callFake((textEditor, text, range) => ({ range, callback }))

    spyOn(testPackage, "getProvider").and.returnValue({ getSuggestionForWord })
    await atom.packages.activatePackage("atom-ide-hyperclick")
    await atom.packages.activatePackage(testPackagePath)

    const editor = await atom.workspace.open(fixturePath("test.txt"))

    mouseEvent(editor, "mousemove", {
      clientX: 10,
      clientY: 10,
    })

    expect(getSuggestionForWord).not.toHaveBeenCalled()

    keyEvent(editor, "keydown", {
      [triggerKey]: true,
    })

    // have to wait until next tick to click on suggestion
    await wait()

    mouseEvent(editor, "mousedown", {
      clientX: 10,
      clientY: 10,
      [triggerKey]: true,
    })

    expect(getSuggestionForWord).toHaveBeenCalledTimes(1)
    expect(getSuggestionForWord).toHaveBeenCalledWith(editor, "test", new Range([0, 0], [0, 4]))
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("should add legacy provider for getSuggestionForWord", async () => {
    const callback = jasmine.createSpy("callback")
    const getSuggestionForWord = jasmine
      .createSpy("getSuggestionForWord")
      .and.callFake((textEditor, text, range) => ({ range, callback }))

    spyOn(testPackage, "getLegacyProvider").and.returnValue({
      getSuggestionForWord,
    })
    await atom.packages.activatePackage("atom-ide-hyperclick")
    await atom.packages.activatePackage(testPackagePath)

    const editor = await atom.workspace.open(fixturePath("test.txt"))

    mouseEvent(editor, "mousemove", {
      clientX: 10,
      clientY: 10,
    })

    expect(getSuggestionForWord).not.toHaveBeenCalled()

    keyEvent(editor, "keydown", {
      [triggerKey]: true,
    })

    expect(getSuggestionForWord).toHaveBeenCalledTimes(1)
    expect(getSuggestionForWord).toHaveBeenCalledWith(editor, "test", new Range([0, 0], [0, 4]))

    // have to wait until next tick to click on suggestion
    await wait()

    mouseEvent(editor, "mousedown", {
      clientX: 10,
      clientY: 10,
      [triggerKey]: true,
    })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("should add provider for getSuggestion", async () => {
    const range = new Range([0, 0], [0, 4])
    const callback = jasmine.createSpy("callback")
    const getSuggestion = jasmine.createSpy("getSuggestion").and.callFake(() => ({ range, callback }))

    spyOn(testPackage, "getProvider").and.returnValue({ getSuggestion })
    await atom.packages.activatePackage("atom-ide-hyperclick")
    await atom.packages.activatePackage(testPackagePath)

    const editor = await atom.workspace.open(fixturePath("test.txt"))

    mouseEvent(editor, "mousemove", {
      clientX: 10,
      clientY: 10,
    })

    expect(getSuggestion).not.toHaveBeenCalled()

    keyEvent(editor, "keydown", {
      [triggerKey]: true,
    })

    expect(getSuggestion).toHaveBeenCalledTimes(1)
    expect(getSuggestion).toHaveBeenCalledWith(editor, new Point(0, 0))

    // have to wait until next tick to click on suggestion
    await wait()

    mouseEvent(editor, "mousedown", {
      clientX: 10,
      clientY: 10,
      [triggerKey]: true,
    })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("should add legacy provider for getSuggestion", async () => {
    const range = new Range([0, 0], [0, 4])
    const callback = jasmine.createSpy("callback")
    const getSuggestion = jasmine.createSpy("getSuggestion").and.callFake(() => ({ range, callback }))

    spyOn(testPackage, "getLegacyProvider").and.returnValue({ getSuggestion })
    await atom.packages.activatePackage("atom-ide-hyperclick")
    await atom.packages.activatePackage(testPackagePath)

    const editor = await atom.workspace.open(fixturePath("test.txt"))

    mouseEvent(editor, "mousemove", {
      clientX: 10,
      clientY: 10,
    })

    expect(getSuggestion).not.toHaveBeenCalled()

    keyEvent(editor, "keydown", {
      [triggerKey]: true,
    })

    expect(getSuggestion).toHaveBeenCalledTimes(1)
    expect(getSuggestion).toHaveBeenCalledWith(editor, new Point(0, 0))

    // have to wait until next tick to click on suggestion
    await wait()

    mouseEvent(editor, "mousedown", {
      clientX: 10,
      clientY: 10,
      [triggerKey]: true,
    })

    expect(callback).toHaveBeenCalledTimes(1)
  })
})
