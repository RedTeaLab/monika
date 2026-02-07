/**
 * Rule types for CoC 7e rules knowledge base
 */

export enum RuleCategory {
  CORE = 'core',
  SKILL = 'skill',
  COMBAT = 'combat',
  SANITY = 'sanity',
  CHASE = 'chase',
  MAGIC = 'magic',
}

export interface RuleSummary {
  id: string;
  title: string;
  category: RuleCategory;
  content: string;
}

export interface RuleSearchResult {
  id: string;
  title: string;
  category: RuleCategory;
  content: string;
  relevance_score: number;
  related_rules: RuleSummary[];
}

export interface RuleSearchResponse {
  results: RuleSearchResult[];
  total: number;
  query: string;
}

export interface RuleResponse {
  id: string;
  title: string;
  category: RuleCategory;
  subcategory?: string;
  content: string;
  example?: string;
  mechanics?: Record<string, any>;
  aliases: string[];
  tags: string[];
  related_rule_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface FAQResponse {
  id: string;
  question: string;
  answer: string;
  category?: string;
  related_rule_ids: string[];
  created_at: string;
}

export interface RuleDetail {
  id: string;
  title: string;
  category: RuleCategory;
  subcategory?: string;
  content: string;
  example?: string;
  mechanics?: Record<string, any>;
  aliases: string[];
  tags: string[];
  related_rule_ids: string[];
  related_rules: RuleSummary[];
  created_at: string;
  updated_at: string;
}
