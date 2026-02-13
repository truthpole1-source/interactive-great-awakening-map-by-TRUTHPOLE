import React from "react";

export default function SplashScreen() {
  return (
    <div className="tp-splash" role="status" aria-label="Loading interactive map">
      <div className="tp-splash-inner">
        <img className="tp-splash-logo" src="/truthpole-logo.svg" alt="Truthpole logo" />
        <div className="tp-splash-title">Interactive Great Awakening Map by Truthpole</div>
        <div className="tp-splash-sub">Tap any node to open a clean explainer, track what you&#39;ve read, and keep moving.</div>
      </div>
    </div>
  );
}
