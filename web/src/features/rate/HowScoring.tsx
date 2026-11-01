import './howscoring.css'

/** The scoring model in four plain sentences, folded until someone asks. */
export function HowScoring() {
  return (
    <details className="how">
      <summary>How scores work</summary>
      <ol>
        <li><strong>Your feeling sets the start.</strong> One of my favourites starts around 9.5, Loved it around 8.5,
          Liked it around 7, It was okay around 5.5, Didn’t like it around 3. “In between” starts on the edge of two.</li>
        <li><strong>Your comparisons move it.</strong> Every “which did you enjoy more?” answer nudges a score. Keep
          preferring a title over ones you rated higher and it climbs into their range; a single answer never does.</li>
        <li><strong>Konomi’s guess only breaks ties.</strong> Titles you haven’t compared yet are ordered by what the
          taste model expects, and only inside their feeling’s range.</li>
        <li><strong>Nothing is thrown away.</strong> Comparisons are kept even when you remove a title, so putting it back
          brings its score back.</li>
      </ol>
    </details>
  )
}
