declare module '*.css?url' {
  const href: string
  export default href
}

declare module '*?worker' {
  const WorkerFactory: new () => Worker
  export default WorkerFactory
}
