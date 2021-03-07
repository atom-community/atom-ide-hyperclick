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
// Legacy providers have a default priority of 0.
function fixLegacyProvider(provider) {
  if (!provider.priority) {
    provider.priority = 0
  }

  return provider
}

module.exports = {
  config: require("./config"),

  activate() {
    const { CompositeDisposable } = require("atom")
    const Hyperclick = require("./Hyperclick")
    this._hyperclick = new Hyperclick()
    this._disposables = new CompositeDisposable()
    this._disposables.add(this._hyperclick)
  },

  deactivate() {
    this._disposables.dispose()
  },

  addLegacyProvider(provider) {
    return this.addProvider(Array.isArray(provider) ? provider.map(fixLegacyProvider) : fixLegacyProvider(provider))
  },

  addProvider(provider) {
    const disposable = this._hyperclick.addProvider(provider)

    this._disposables.add(disposable)

    return disposable
  },

  /**
   * A TextEditor whose creation is announced via atom.workspace.observeTextEditors() will be
   * observed by default by hyperclick. However, if a TextEditor is created via some other means,
   * (such as a building block for a piece of UI), then it must be observed explicitly.
   */
  observeTextEditor() {
    return (textEditor) => this._hyperclick.observeTextEditor(textEditor)
  },
}
