const { createRunner } = require("atom-jasmine3-test-runner")

// https://github.com/UziTech/atom-jasmine3-test-runner#api
module.exports = createRunner({
  specHelper: {
    attachToDom: true,
    profile: true,
    ci: true,
  },
})
