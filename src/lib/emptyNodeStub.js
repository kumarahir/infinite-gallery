// Stand-in for Node builtins (fs, path, crypto) that @techstark/opencv-js
// `require()`s behind an `ENVIRONMENT_IS_NODE` check that's always false in
// the browser. The real modules are never actually called; this just gives
// Turbopack something resolvable at build time.
module.exports = {};
