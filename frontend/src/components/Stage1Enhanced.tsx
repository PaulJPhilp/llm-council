import { type FC, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Stage1Response } from "../types";
import "./Stage1.css";

type Stage1EnhancedProps = {
  responses?: Stage1Response[];
};

/**
 * Enhanced Stage 1 component with improved accessibility and UX
 * Shows individual responses from each council member
 */
const Stage1Enhanced: FC<Stage1EnhancedProps> = ({ responses }) => {
  const [activeTab, setActiveTab] = useState(0);

  if (!responses || responses.length === 0) {
    return null;
  }

  const currentResponse = responses[activeTab];

  return (
    <div
      aria-label="Stage 1: Individual Responses"
      className="stage stage1"
      role="region"
    >
      <h3 className="stage-title">Stage 1: Individual Responses</h3>
      <p className="stage-description">
        Each council member provided their initial response to the question:
      </p>

      {/* Tabs */}
      <div
        aria-label="Council member responses"
        className="tabs"
        role="tablist"
      >
        {responses.map((resp, index) => (
          <button
            aria-controls={`stage1-panel-${index}`}
            aria-selected={activeTab === index}
            className={`tab ${activeTab === index ? "active" : ""}`}
            key={index}
            onClick={() => setActiveTab(index)}
            role="tab"
          >
            {resp.model.split("/")[1] || resp.model}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div
        aria-labelledby={`tab-${activeTab}`}
        className="tab-content"
        id={`stage1-panel-${activeTab}`}
        role="tabpanel"
      >
        <div className="model-info">
          <span className="model-name" title={currentResponse.model}>
            {currentResponse.model}
          </span>
        </div>

        <div className="response-text markdown-content">
          <ReactMarkdown>{currentResponse.content}</ReactMarkdown>
        </div>

        {currentResponse.reasoning_details && (
          <details className="reasoning-details">
            <summary>Show reasoning details</summary>
            <div className="markdown-content">
              <ReactMarkdown>{currentResponse.reasoning_details}</ReactMarkdown>
            </div>
          </details>
        )}
      </div>
    </div>
  );
};

export default Stage1Enhanced;
