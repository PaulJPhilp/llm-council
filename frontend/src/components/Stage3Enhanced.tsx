import { FC } from "react";
import ReactMarkdown from "react-markdown";
import type { Stage3Response } from "../types";
import "./Stage2.css";

interface Stage3EnhancedProps {
  stage3?: Stage3Response;
}

/**
 * Enhanced Stage 3 component with improved accessibility
 * Shows the final synthesized response from the chairman model
 */
const Stage3Enhanced: FC<Stage3EnhancedProps> = ({ stage3 }) => {
  if (!stage3) {
    return null;
  }

  return (
    <div className="stage stage3" role="region" aria-label="Stage 3: Final Synthesis">
      <h3 className="stage-title">Stage 3: Final Synthesis</h3>

      <div className="stage-intro">
        <h4>Chairman's Response</h4>
        <p className="stage-description">
          Based on all individual responses and peer evaluations, the chairman model synthesizes a final answer.
        </p>
      </div>

      {/* Model Info */}
      <div className="model-info">
        <span className="ranking-model" title={stage3.model}>
          Chairman: {stage3.model}
        </span>
      </div>

      {/* Final Response */}
      <div className="final-response">
        <div className="markdown-content">
          <ReactMarkdown>{stage3.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default Stage3Enhanced;
