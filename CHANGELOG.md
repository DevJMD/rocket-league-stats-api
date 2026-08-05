# Changelog

## [0.1.1](https://github.com/DevJMD/rocket-league-stats-api/compare/v0.1.0...v0.1.1) (2026-08-05)


### Bug Fixes

* 🐛 decouple npm publishing from artifact packaging ([b8457d7](https://github.com/DevJMD/rocket-league-stats-api/commit/b8457d70357de1ed8ae60397d2b73b90b9906756))
* 🐛 publish in the release run instead of on the release event ([c2a3293](https://github.com/DevJMD/rocket-league-stats-api/commit/c2a3293c4277e1fb88ada1cb8d34698b94ca885d))

## 0.1.0 (2026-08-05)


### Features

* ✨ add decorator driven plugins ([8964871](https://github.com/DevJMD/rocket-league-stats-api/commit/89648719e2c4a90ea33de7ade220ad648dc81b22))
* ✨ add fluent client with tick throttling and commands ([f424d31](https://github.com/DevJMD/rocket-league-stats-api/commit/f424d31610d3baa0ddfbf4f4d3647cb05ec8f985))
* ✨ add named constants for event and command names ([3c6f85e](https://github.com/DevJMD/rocket-league-stats-api/commit/3c6f85e87e1aa14db47c8c3cb964509d9198d61c))
* ✨ add socket framing, validation and decoding ([a378d2a](https://github.com/DevJMD/rocket-league-stats-api/commit/a378d2acb9176a10dcc47c8f2c85b05c065730b4))
* ✨ add typed payloads for every event and command ([bce7832](https://github.com/DevJMD/rocket-league-stats-api/commit/bce783266b82ec2ecb35843c9415f39409b9b29b))
* ✨ export the public api ([3345260](https://github.com/DevJMD/rocket-league-stats-api/commit/33452602808bde5b6e4638e0eef86195ee5bc747))


### Bug Fixes

* 🐛 start the release manifest at 0.0.0 ([6ba2077](https://github.com/DevJMD/rocket-league-stats-api/commit/6ba2077f514e210da2a4ea844d23d8e4678c5359))
* 🐛 trigger the release workflow on master ([de3fe16](https://github.com/DevJMD/rocket-league-stats-api/commit/de3fe16c3f2c9931b4ffda7f65f587d98173075a))


### Refactoring

* ♻️ use Promise.withResolvers in the message stream ([7ebfdd5](https://github.com/DevJMD/rocket-league-stats-api/commit/7ebfdd56c68f29b17cb1480d873199ab7bbe1799))


### Documentation

* 📝 add readme and runnable examples ([61a96af](https://github.com/DevJMD/rocket-league-stats-api/commit/61a96afc5ca03ba6760c3494e59048be8c9075e0))
* 📝 document package manager support and toolchain choices ([37edbc8](https://github.com/DevJMD/rocket-league-stats-api/commit/37edbc8aea646871877dd3093380cc348025cb5d))


### CI

* 👷 add release please pipeline with artifact publishing ([767be6f](https://github.com/DevJMD/rocket-league-stats-api/commit/767be6f02a968b90fb5d503ca14148849cfed785))
