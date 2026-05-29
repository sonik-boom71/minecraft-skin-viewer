/* ============================================================
   ENTRY POINT
   Applies the default skin first (so module init below produces no
   history/achievement noise), wires every feature module, starts the
   render loop, then honours any ?skin/?env/?anim share parameters.
   ============================================================ */
import { applySkin, makeDefaultSkin, start } from './core.js';
import { initUI } from './ui.js';
import { initEditor } from './editor.js';
import { initSkins, parseShareParams } from './skins.js';
import { initMedia } from './media.js';
import { initArcade } from './arcade.js';

applySkin(makeDefaultSkin(), 'steve.png');

initUI();
initEditor();
initSkins();
initMedia();
initArcade();

start();
parseShareParams();

/* PWA */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
