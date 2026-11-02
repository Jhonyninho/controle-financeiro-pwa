// Versão do app (vem do package.json, injetada pelo Vite em vite.config.js).
/* global __VERSAO__ */
export const VERSAO = typeof __VERSAO__ === 'string' ? __VERSAO__ : '1.0.0';
export const VERSAO_CURTA = VERSAO.split('.').slice(0, 2).join('.'); // "1.0"
