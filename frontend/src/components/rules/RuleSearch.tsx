/**
 * RuleSearch component for searching CoC 7e rules
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Search, Loader2, BookOpen, X } from 'lucide-react';
import { RuleSearchResult, RuleCategory } from '../../types/rules';
import { RuleInlineResult } from './RuleInlineResult';
import { RuleDetailDialog } from './RuleDetailDialog';

interface RuleSearchProps {
  onRuleSelect?: (ruleId: string) => void;
  className?: string;
}

export function RuleSearch({ onRuleSelect, className = '' }: RuleSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RuleSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRule, setSelectedRule] = useState<RuleSearchResult | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Search for rules
  const searchRules = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/rules/search?query=${encodeURIComponent(searchQuery)}&limit=5`
      );

      if (!response.ok) {
        throw new Error('Failed to search rules');
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (error) {
      console.error('Error searching rules:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Trigger search when debounced query changes
  useEffect(() => {
    searchRules(debouncedQuery);
  }, [debouncedQuery, searchRules]);

  // Handle rule selection
  const handleRuleClick = (rule: RuleSearchResult) => {
    setSelectedRule(rule);
    setShowDialog(true);
    onRuleSelect?.(rule.id);
  };

  // Clear search
  const handleClear = () => {
    setQuery('');
    setResults([]);
    setSelectedRule(null);
  };

  return (
    <>
      <div className={`relative ${className}`}>
        {/* Search input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <BookOpen className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rules (e.g., 'pushing', 'sanity', 'combat')..."
            className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
          {query && (
            <button
              onClick={handleClear}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute right-12 top-1/2 transform -translate-y-1/2">
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
          </div>
        )}

        {/* Search results dropdown */}
        {results.length > 0 && query && (
          <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg max-h-96 overflow-y-auto border border-gray-200">
            <div className="py-1">
              {results.map((result) => (
                <RuleInlineResult
                  key={result.id}
                  result={result}
                  onClick={() => handleRuleClick(result)}
                />
              ))}
            </div>
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                {results.length} result{results.length !== 1 ? 's' : ''} found
              </p>
            </div>
          </div>
        )}

        {/* No results message */}
        {!isLoading && query && results.length === 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500 text-center">
              No rules found for "{query}"
            </p>
          </div>
        )}
      </div>

      {/* Rule detail dialog */}
      {selectedRule && (
        <RuleDetailDialog
          ruleId={selectedRule.id}
          open={showDialog}
          onOpenChange={setShowDialog}
        />
      )}
    </>
  );
}
