/**
 * RuleDetailDialog component for displaying full rule details
 */

import React, { useState, useEffect } from 'react';
import { X, BookOpen, Tag, Link2, Info } from 'lucide-react';
import { RuleDetail, RuleCategory } from '../../types/rules';

interface RuleDetailDialogProps {
  ruleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RuleDetailDialog({ ruleId, open, onOpenChange }: RuleDetailDialogProps) {
  const [rule, setRule] = useState<RuleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch rule details when dialog opens
  useEffect(() => {
    if (!open || !ruleId) return;

    const fetchRule = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/rules/${ruleId}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError('Rule not found');
          } else {
            throw new Error('Failed to load rule details');
          }
          return;
        }

        const data: RuleDetail = await response.json();
        setRule(data);
      } catch (err) {
        console.error('Error fetching rule:', err);
        setError('Failed to load rule details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRule();
  }, [open, ruleId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setRule(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              {rule?.title || 'Rule Details'}
            </h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Info className="h-12 w-12 text-gray-400 mb-3" />
              <p className="text-gray-600">{error}</p>
            </div>
          ) : rule ? (
            <div className="space-y-6">
              {/* Category badge */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  {rule.category}
                </span>
                {rule.subcategory && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
                    {rule.subcategory}
                  </span>
                )}
              </div>

              {/* Main content */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Description</h3>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {rule.content}
                </p>
              </div>

              {/* Example */}
              {rule.example && (
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r">
                  <h4 className="text-sm font-medium text-blue-900 mb-1">Example</h4>
                  <p className="text-sm text-blue-800 italic">{rule.example}</p>
                </div>
              )}

              {/* Mechanics */}
              {rule.mechanics && Object.keys(rule.mechanics).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Mechanics</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <dl className="space-y-2">
                      {Object.entries(rule.mechanics).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-3 gap-4">
                          <dt className="text-sm font-medium text-gray-700 capitalize">
                            {key.replace(/_/g, ' ')}
                          </dt>
                          <dd className="col-span-2 text-sm text-gray-600">
                            {Array.isArray(value) ? value.join(', ') : String(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              )}

              {/* Tags */}
              {rule.tags && rule.tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {rule.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Aliases */}
              {rule.aliases && rule.aliases.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Also known as</h3>
                  <div className="flex flex-wrap gap-2">
                    {rule.aliases.map((alias) => (
                      <span
                        key={alias}
                        className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600"
                      >
                        {alias}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Related rules */}
              {rule.related_rules && rule.related_rules.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Related Rules
                  </h3>
                  <div className="space-y-2">
                    {rule.related_rules.map((related) => (
                      <div
                        key={related.id}
                        className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <h4 className="text-sm font-medium text-gray-900">{related.title}</h4>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{related.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Last updated: {new Date(rule.updated_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={() => onOpenChange(false)}
            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
