// @techstark/opencv-js's CJS build sometimes exports a Promise (resolving to
// the ready cv module) rather than the module itself. Dynamically
// `import()`-ing that package directly from application code and manually
// chaining `.then()` on the result trips a Turbopack interop bug ("Method
// Promise.prototype.then called on incompatible receiver [object Module]") —
// the raw import() result comes back as an exotic object rather than a real
// Promise. A plain top-level `import` here instead lets Turbopack's own
// async-module handling correctly await it as part of evaluating this
// (statically-authored) module, so by the time scanDocument.ts dynamically
// imports *this* file, its `default` export is already fully resolved.
import cv from "@techstark/opencv-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default cv as any;
