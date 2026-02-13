/**
 * RuleInlineResult component for displaying compact rule search results
 */

import { RuleSearchResult } from '../../types/rules';

interface RuleInlineResultProps {
  result: RuleSearchResult;
  onClick: () => void;
}

export function RuleInlineResult({ result, onClick }: RuleInlineResultProps) {
  // Truncate content if too long
  const truncateContent = (content: string, maxLength: number = 150) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  // Get relevance color
  const getRelevanceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50';
    if (score >= 0.6) return 'text-blue-600 bg-blue-50';
    if (score >= 0.4) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  const relevancePercent = Math.round(result.relevance_score * 100);

  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Title and category */}
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-gray-900 truncate">
              {result.title}
            </h4>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
              {result.category}
            </span>
          </div>

          {/* Content preview */}
          <p className="text-xs text-gray-600 line-clamp-2">
            {truncateContent(result.content)}
          </p>

          {/* Related rules count */}
          {result.related_rules && result.related_rules.length > 0 && (
            <div className="mt-1 flex items-center gap-1">
              <span className="text-xs text-gray-500">
                {result.related_rules.length} related rule{result.related_rules.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Relevance score */}
        <div className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium ${getRelevanceColor(result.relevance_score)}`}>
          {relevancePercent}%
        </div>
      </div>
    </button>
  );
}
