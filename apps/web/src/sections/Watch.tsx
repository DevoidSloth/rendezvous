import { useRef, useState } from "react";

/** The 30-second promo. The play button is the table: the station every line ends at. */
export function Watch() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const play = () => {
    setPlaying(true);
    void video.current?.play();
  };

  return (
    <section className="watch" id="watch" aria-labelledby="watch-title">
      <div className="section-head">
        <h2 id="watch-title">One evening in 30 seconds</h2>
        <p>Four friends, one text, a booked table and a settled bill. Sound on.</p>
      </div>
      <div className={`watch-frame ${playing ? "playing" : ""}`}>
        <video ref={video} src="/promo.mp4" poster="/promo-poster.jpg" preload="metadata" playsInline controls={playing} onEnded={() => setPlaying(false)} />
        {!playing && (
          <button className="watch-play" onClick={play}>
            <span className="watch-station" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30">
                <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
              </svg>
            </span>
            <span>Play the video</span>
          </button>
        )}
      </div>
    </section>
  );
}
