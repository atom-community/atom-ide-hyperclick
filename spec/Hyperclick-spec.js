const { Point } = require("atom")
const Hyperclick = require("../lib/Hyperclick")

describe("Hyperclick.js", () => {
  let hyperclick
  beforeEach(() => {
    hyperclick = new Hyperclick()
  })

  describe("getSuggestion", () => {
    let provider1, provider2, textEditor, position
    beforeEach(async () => {
      hyperclick._textEditorSubscription.dispose()
      provider1 = { getSuggestion: jasmine.createSpy("provider1") }
      provider2 = { getSuggestion: jasmine.createSpy("provider2") }
      textEditor = await atom.workspace.open()
      position = new Point(0, 0)
    })

    it("should call next provider on falsey suggestion", async () => {
      hyperclick.addProvider([provider1, provider2])
      await hyperclick.getSuggestion(textEditor, position)

      expect(provider1.getSuggestion).toHaveBeenCalled()
      expect(provider2.getSuggestion).toHaveBeenCalled()
    })

    it("should call next provider on false suggestion", async () => {
      provider1.getSuggestion.and.returnValue(false)
      hyperclick.addProvider([provider1, provider2])

      await hyperclick.getSuggestion(textEditor, position)

      expect(provider1.getSuggestion).toHaveBeenCalled()
      expect(provider2.getSuggestion).toHaveBeenCalled()
    })

    it("should not call next provider on truthy suggestion", async () => {
      provider1.getSuggestion.and.returnValue(true)
      hyperclick.addProvider([provider1, provider2])

      const suggestion = await hyperclick.getSuggestion(textEditor, position)

      expect(suggestion).toBe(true)
      expect(provider1.getSuggestion).toHaveBeenCalled()
      expect(provider2.getSuggestion).not.toHaveBeenCalled()
    })

    it("should call providers by descending priority", async () => {
      provider1.priority = 1
      provider2.priority = 2
      provider1.getSuggestion.and.returnValue(true)
      provider2.getSuggestion.and.returnValue(true)
      hyperclick.addProvider([provider1, provider2])

      await hyperclick.getSuggestion(textEditor, position)

      expect(provider1.getSuggestion).not.toHaveBeenCalled()
      expect(provider2.getSuggestion).toHaveBeenCalled()
    })
  })
})
