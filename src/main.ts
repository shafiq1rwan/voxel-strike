import { Game } from './game';

const app = document.getElementById('app');
if (!app) throw new Error('missing #app root');
new Game(app);
