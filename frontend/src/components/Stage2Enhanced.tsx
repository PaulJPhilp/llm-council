import { useState, FC } from "react";
import ReactMarkdown from "react-markdown";
import type {
  Stage2Ranking,
  AggregateRanking,
  LabelToModelMap,
} from "../types";
import "./Stage2.css";

interface Stage2EnhancedProps {
  rankings?: Stage2Ranking[];
  labelToModel?: LabelToModelMap;
  aggregateRankings?: AggregateRanking[];
}

function deAnonymizeText(
  text: string,
  labelToModel?: LabelToModelMap
): string {
  if (!labelToModel) return text;

  let result = text;
  Object.entries(labelToModel).forEach(([label, model]) => {
    const modelShortName = model.split("/")[1] || model;
    result = result.replace(
      new RegExp(label, "g"),
      `**${modelShortName}**`
    );
  });
  return result;
}

/**
 * Enhanced Stage 2 component with improved accessibility
 * Shows peer rankings and evaluations with de-anonymization
 */
const Stage2Enhanced: FC<Stage2EnhancedProps> = ({
  rankings,
  labelToModel,
  aggregateRankings,
}) => {
  const [activeTab, setActiveTab] = useState(0);

  if (!rankings || rankings.length === 0) {
    return null;
  }

  const currentRanking = rankings[activeTab];

  return (
    <div className="stage stage2" role="region" aria-label="Stage 2: Peer Rankings">
      <h3 className="stage-title">Stage 2: Peer Rankings</h3>

      <div className="stage-intro">
        <h4>Raw Evaluations</h4>
        <p className="stage-description">
          Each model evaluated all responses (anonymized as Response A, B, C, etc.) and provided rankings.
          Below, model names are shown in <strong>bold</strong> for readability, but the original evaluation used anonymous labels.
        </p>
      </div>

      {/* Tabs */}
      <div
        className="tabs"
        role="tablist"
        aria-label="Evaluator responses"
      >
        {rankings.map((rank, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={activeTab === index}
            aria-controls={`stage2-panel-${index}`}
            className={`tab ${activeTab === index ? "active" : ""}`}
            onClick={() => setActiveTab(index)}
          >
            {rank.model.split("/")[1] || rank.model}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div
        id={`stage2-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="tab-content"
      >
        <div className="model-info">
          <span className="ranking-model" title={currentRanking.model}>
            Evaluator: {currentRanking.model}
          </span>
        </div>

        {/* Raw Evaluation */}
        <div className="ranking-section">
          <h4>Evaluation Text</h4>
          <div className="ranking-content markdown-content">
            <ReactMarkdown>
              {deAnonymizeText(currentRanking.ranking, labelToModel)}
            </ReactMarkdown>
          </div>
        </div>

        {/* Extracted Ranking */}
        {currentRanking.parsed_ranking &&
          currentRanking.parsed_ranking.length > 0 && (
            <div className="parsed-ranking-section">
              <h4>Extracted Ranking</h4>
              <ol className="parsed-ranking">
                {currentRanking.parsed_ranking.map((label, i) => (
                  <li key={i} className="ranking-item">
                    <span className="rank-label">
                      {labelToModel && labelToModel[label]
                        ? labelToModel[label].split("/")[1] ||
                          labelToModel[label]
                        : label}
                    </span>
                    <span className="rank-position">Position {i + 1}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
      </div>

      {/* Aggregate Rankings */}
      {aggregateRankings && aggregateRankings.length > 0 && (
        <div
          className="aggregate-rankings"
          role="region"
          aria-label="Aggregate Rankings"
        >
          <h4>Aggregate Rankings (Street Cred)</h4>
          <p className="stage-description">
            Combined results across all peer evaluations (lower average rank is better):
          </p>

          <div className="aggregate-list">
            {aggregateRankings.map((agg, index) => (
              <div
                key={index}
                className="aggregate-item"
                role="listitem"
              >
                <div className="rank-badge">#{index + 1}</div>
                <div className="rank-details">
                  <div className="rank-model">
                    {agg.model.split("/")[1] || agg.model}
                  </div>
                  <div className="rank-stats">
                    <span className="rank-score">
                      Avg Rank: <strong>{agg.average_rank.toFixed(2)}</strong>
                    </span>
                    <span className="rank-count">
                      ({agg.rankings_count} evaluations)
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Stage2Enhanced;
