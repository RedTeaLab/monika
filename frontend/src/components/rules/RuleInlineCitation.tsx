/**
 * RuleInlineCitation component for displaying rule search results in message bubbles
 * Shows collapsible rule citations with clickable links to full details
 */

import { useState, useCallback } from 'react';
import { BookOpen, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ToolResult } from '@/types/websocket';

interface RuleInlineCitationProps {
  toolResult: ToolResult;
  onRuleClick?: (ruleId: string) => void;
  compact?: boolean;
}

// Helper function to get relevance color
const getRelevanceColor = (score: number) => {
  if (score >= 0.8) return 'text-green-700 bg-green-50 border-green-200';
  if (score >= 0.6) return 'text-blue-700 bg-blue-50 border-blue-200';
  if (score >= 0.4) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  return 'text-gray-700 bg-gray-50 border-gray-200';
};

export function RuleInlineCitation({
  toolResult,
  onRuleClick,
  compact = false,
}: RuleInlineCitationProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);

  // Handle expand/collapse toggle
  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Handle rule click
  const handleRuleClick = useCallback(
    (ruleId: string) => {
      onRuleClick?.(ruleId);
    },
    [onRuleClick]
  );

  // Check for error state
  if (toolResult.result.error) {
    return (
      <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-md">
        <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-xs font-medium text-red-900">Rule Search Error</p>
          <p className="text-xs text-red-700 mt-0.5">{toolResult.result.error}</p>
        </div>
      </div>
    );
  }

  // Check for empty results
  const results = toolResult.result.results ?? [];
  const query = toolResult.result.query ?? '';

  if (results.length === 0) {
    return (
      <div className="p-2 bg-gray-50 border border-gray-200 rounded-md">
        <p className="text-xs text-gray-600">
          No rules found for "{query}"
        </p>
      </div>
    );
  }

  // Determine how many results to show
  const maxInitialResults = 3;
  const showAll = isExpanded || results.length <= maxInitialResults;
  const displayedResults = showAll ? results : results.slice(0, maxInitialResults);
  const remainingCount = results.length - maxInitialResults;

  return (
    <div className="border border-blue-200 rounded-md bg-blue-50/30 overflow-hidden">
      {/* Collapsible Header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50/50 transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-3 w-3 text-blue-600" />
          <span className="text-xs font-medium text-blue-900">
            Rule Citations
          </span>
          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
            {results.length}
          </Badge>
          {query && (
            <span className="text-xs text-blue-700 truncate max-w-[150px]">
              "{query}"
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-blue-600" />
        ) : (
          <ChevronRight className="h-3 w-3 text-blue-600" />
        )}
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="border-t border-blue-200/50 divide-y divide-blue-200/50">
          {displayedResults.map((rule, idx) => {
            const relevancePercent = Math.round(rule.relevance_score * 100);

            return (
              <button
                key={`${rule.id}-${idx}`}
                onClick={() => handleRuleClick(rule.id)}
                className={cn(
                  "w-full text-left p-2 hover:bg-blue-50 transition-colors",
                  "flex items-start gap-2"
                )}
              >
                {/* Rule info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-gray-900 truncate">
                      {rule.title}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">
                    {rule.content.slice(0, 120)}
                    {rule.content.length > 120 && '...'}
                  </p>
                </div>

                {/* Relevance badge */}
                <Badge
                  variant="outline"
                  className={cn(
                    "flex-shrink-0 text-xs font-medium",
                    getRelevanceColor(rule.relevance_score)
                  )}
                >
                  {relevancePercent}%
                </Badge>
              </button>
            );
          })}

          {/* Show more button */}
          {!showAll && remainingCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggle}
              className="w-full h-8 text-xs text-blue-700 hover:text-blue-900 hover:bg-blue-100 rounded-none"
            >
              Show {remainingCount} more rule{remainingCount > 1 ? 's' : ''}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
