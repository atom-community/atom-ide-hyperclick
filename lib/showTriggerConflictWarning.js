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
function showTriggerConflictWarning() {
  const triggerKeys = atom.config.get(`atom-ide-hyperclick.${process.platform}TriggerKeys`)

  if (!(typeof triggerKeys === "string")) {
    throw new Error("Invariant violation: \"typeof triggerKeys === 'string'\"")
  }

  const triggerKeyDescription = getTriggerDescription(triggerKeys)
  const { platform } = process
  const commandOrMeta = platform === "darwin" ? "command" : "meta"
  const optionOrAlt = platform === "darwin" ? "option" : "alt"
  const alternative = triggerKeys === "altKey,metaKey" ? commandOrMeta : `${commandOrMeta} + ${optionOrAlt}`
  return atom.notifications.addInfo(`Hyperclick (jump to definition) is using ${triggerKeyDescription}`, {
    description:
      `If you want to use ${triggerKeyDescription} for multiple cursors instead,` +
      ' change the Hyperclick "Trigger Keys" setting.<br /><br />' +
      `(You can still use ${alternative} + click for multiple cursors.)`,
    dismissable: true,
  })
}

function getTriggerDescription(trigger) {
  const schema = atom.config.getSchema(`atom-ide-hyperclick.${process.platform}TriggerKeys`)

  if (!(schema && schema.enum)) {
    throw new Error('Invariant violation: "schema && schema.enum"')
  }

  const match = schema.enum.find((option) => {
    if (!(option && typeof option.value === "string")) {
      throw new Error("Invariant violation: \"option && typeof option.value === 'string'\"")
    }

    return option.value === trigger
  })

  if (!(match && typeof match.description === "string")) {
    throw new Error("Invariant violation: \"match && typeof match.description === 'string'\"")
  }

  return match.description
}

module.exports = showTriggerConflictWarning
