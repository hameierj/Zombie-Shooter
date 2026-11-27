// Vite turns `import url from './file.wav?url'` into the hashed URL of the file in the build.
declare module '*?url' { const url: string; export default url; }
