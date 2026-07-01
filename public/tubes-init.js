// Loads the TubesCursor ESM module and exposes it on window so the React
// component can access it without webpack bundling interference.
import TubesCursor from '/tubes1.min.js'
window.__TubesCursor = TubesCursor
document.dispatchEvent(new CustomEvent('TubesCursorReady'))
