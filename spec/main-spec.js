describe("tests", () => {
  beforeEach(async () => {
    // Trigger deferred activation
    // atom.packages.triggerDeferredActivationHooks();
    // Activate activation hook
    // atom.packages.triggerActivationHook("core:loaded-shell-environment");
    await atom.packages.activatePackage("atom-ide-hyperclick");
  });

  it("Activation", async function () {
    expect(atom.packages.isPackageLoaded("atom-ide-hyperclick")).toBeTruthy();
  });
});
