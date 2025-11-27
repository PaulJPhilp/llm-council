import { useState, FC } from "react";
import ReactMarkdown from "react-markdown";
import type { Stage1Response } from "../types";
import "./Stage1.css";

interface Stage1EnhancedProps {
  responses?: Stage1Response[];
}

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
    <div className="stage stage1" role="region" aria-label="Stage 1: Individual Responses">
      <h3 className="stage-title">Stage 1: Individual Responses</h3>
      <p className="stage-description">
        Each council member provided their initial response to the question:
      </p>

      {/* Tabs */}
      <div
        className="tabs"
        role="tablist"
        aria-label="Council member responses"
      >
        {responses.map((resp, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={activeTab === index}
            aria-controls={`stage1-panel-${index}`}
            className={`tab ${activeTab === index ? "active" : ""}`}
            onClick={() => setActiveTab(index)}
          >
            {resp.model.split("/")[1] || resp.model}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div
        id={`stage1-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="tab-content"
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
