import type { ExampleSentence } from '../../types/domain'

export function ExampleAttribution({ example }: { example: ExampleSentence }) {
  if (!example.attribution?.length) return example.source ? <small className="content-subtle">Source: {example.source}</small> : null
  return <p className="content-subtle">{example.attribution.map((source, index) => <span key={`${source.language}-${source.sentenceId}`}>
    {index > 0 && ' · '}<a href={source.url} target="_blank" rel="noopener noreferrer">{source.language} sentence #{source.sentenceId}</a> by {source.author} ({source.license})
  </span>)}</p>
}
