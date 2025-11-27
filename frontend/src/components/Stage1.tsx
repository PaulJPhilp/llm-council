import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Stage1Response } from "../types";
import "./Stage1.css";

type Stage1Props = {
  responses?: Stage1Response[];
};

export default function Stage1({ responses }: Stage1Props) {
  const [activeTab, setActiveTab] = useState(0);

  if (!responses || responses.length === 0) {
    return null;
  }

  return (
    <div className="stage stage1">
      <h3 className="stage-title">Stage 1: Individual Responses</h3>

      <div className="tabs">
        {responses.map((resp, index) => (
          <button
            className={`tab ${activeTab === index ? "active" : ""}`}
            key={index}
            onClick={() => setActiveTab(index)}
          >
            {resp.model.split("/")[1] || resp.model}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div className="model-name">{responses[activeTab].model}</div>
        <div className="response-text markdown-content">
          <ReactMarkdown>{responses[activeTab].content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
