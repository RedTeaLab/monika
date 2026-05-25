package modelsdev

// defaultLimits provides fallback model limits sourced from models.dev when
// the local cache file is not available. This is updated periodically.
var defaultLimits = map[string]ModelLimit{
	// OpenAI
	"gpt-4o":              {Context: 128000, Output: 16384},
	"gpt-4o-mini":         {Context: 128000, Output: 16384},
	"gpt-4.1":             {Context: 1047576, Output: 32768},
	"gpt-4.1-mini":        {Context: 1047576, Output: 32768},
	"gpt-4.1-nano":        {Context: 1047576, Output: 32768},
	"gpt-4-turbo":         {Context: 128000, Output: 4096},
	"gpt-4":               {Context: 8192, Output: 8192},
	"gpt-3.5-turbo":       {Context: 16385, Output: 4096},
	"gpt-5":               {Context: 400000, Output: 128000},
	"gpt-5-mini":          {Context: 400000, Output: 128000},
	"gpt-5-nano":          {Context: 400000, Output: 128000},
	"gpt-5-codex":         {Context: 400000, Output: 128000},
	"gpt-5.1":             {Context: 400000, Output: 128000},
	"gpt-5.2":             {Context: 400000, Output: 128000},
	"gpt-5.3-codex":       {Context: 400000, Output: 128000},
	"gpt-5.4":             {Context: 1050000, Output: 128000},
	"gpt-5.4-nano":        {Context: 400000, Output: 128000},
	"gpt-5.4-mini":        {Context: 400000, Output: 128000},
	"gpt-5.5":             {Context: 1050000, Output: 128000},
	"gpt-5-chat-latest":   {Context: 400000, Output: 128000},
	"gpt-5.1-codex-mini":  {Context: 400000, Output: 128000},
	"gpt-5.1-codex-max":   {Context: 400000, Output: 128000},
	"gpt-5.1-codex":       {Context: 400000, Output: 128000},
	"gpt-5.2-codex":       {Context: 400000, Output: 128000},
	"gpt-5.2-pro":         {Context: 400000, Output: 128000},
	"gpt-5.4-pro":         {Context: 1050000, Output: 128000},
	"gpt-5-pro":           {Context: 400000, Output: 272000},
	"chatgpt-4o-latest":   {Context: 128000, Output: 16384},
	"o1":                  {Context: 200000, Output: 100000},
	"o1-mini":             {Context: 128000, Output: 65536},
	"o1-preview":          {Context: 128000, Output: 32768},
	"o3":                  {Context: 200000, Output: 100000},
	"o3-mini":             {Context: 200000, Output: 100000},
	"o4-mini":             {Context: 200000, Output: 100000},
	"o3-pro":              {Context: 200000, Output: 100000},

	// DeepSeek
	"deepseek-chat":       {Context: 163840, Output: 8192},
	"deepseek-reasoner":   {Context: 128000, Output: 64000},
	"deepseek-v3":         {Context: 128000, Output: 8192},
	"deepseek-v3.1":       {Context: 131072, Output: 32768},
	"deepseek-v3.2":       {Context: 163840, Output: 65536},
	"deepseek-r1":         {Context: 128000, Output: 8192},
	"deepseek-r1-0528":    {Context: 163840, Output: 32768},
	"deepseek-v4-pro":     {Context: 1048576, Output: 384000},
	"deepseek-v4-flash":   {Context: 1048576, Output: 384000},

	// Anthropic Claude
	"claude-3-opus":         {Context: 200000, Output: 4096},
	"claude-3.5-sonnet":     {Context: 200000, Output: 8192},
	"claude-3.5-haiku":      {Context: 200000, Output: 8192},
	"claude-3.7-sonnet":     {Context: 200000, Output: 64000},
	"claude-sonnet-4":       {Context: 200000, Output: 64000},
	"claude-sonnet-4-5":     {Context: 200000, Output: 64000},
	"claude-sonnet-4.5":     {Context: 200000, Output: 64000},
	"claude-sonnet-4-6":     {Context: 1000000, Output: 64000},
	"claude-sonnet-4.6":     {Context: 1000000, Output: 64000},
	"claude-opus-4":         {Context: 200000, Output: 32000},
	"claude-opus-4-1":       {Context: 200000, Output: 32000},
	"claude-opus-4.1":       {Context: 200000, Output: 32000},
	"claude-opus-4-5":       {Context: 200000, Output: 64000},
	"claude-opus-4.5":       {Context: 200000, Output: 64000},
	"claude-opus-4-6":       {Context: 1000000, Output: 128000},
	"claude-opus-4.6":       {Context: 1000000, Output: 128000},
	"claude-opus-4-7":       {Context: 1000000, Output: 128000},
	"claude-opus-4.7":       {Context: 1000000, Output: 128000},
	"claude-haiku-4-5":      {Context: 200000, Output: 64000},
	"claude-haiku-4.5":      {Context: 200000, Output: 64000},
	"claude-3-haiku":        {Context: 200000, Output: 4096},
	"claude-3-sonnet":       {Context: 200000, Output: 4096},

	// Google Gemini
	"gemini-2.0-flash":          {Context: 1048576, Output: 8192},
	"gemini-2.0-flash-lite":     {Context: 1048576, Output: 8192},
	"gemini-2.5-pro":            {Context: 1048576, Output: 65536},
	"gemini-2.5-flash":          {Context: 1048576, Output: 65536},
	"gemini-2.5-flash-lite":     {Context: 1048576, Output: 65536},
	"gemini-3-pro-preview":      {Context: 1048576, Output: 65536},
	"gemini-3-flash-preview":    {Context: 1048576, Output: 65536},
	"gemini-3.1-pro-preview":    {Context: 1048576, Output: 65536},
	"gemini-3.1-flash-lite":     {Context: 1048576, Output: 65536},
	"gemini-3.5-flash":          {Context: 1048576, Output: 65536},

	// Google Gemma
	"gemma-3-27b-it":  {Context: 131072, Output: 16384},
	"gemma-3-12b-it":  {Context: 131072, Output: 16384},
	"gemma-3-4b-it":   {Context: 131072, Output: 16384},
	"gemma-4-31b-it":  {Context: 262144, Output: 32768},
	"gemma-4-26b-it":  {Context: 262144, Output: 32768},

	// xAI Grok
	"grok-4":                     {Context: 256000, Output: 64000},
	"grok-4-fast":                {Context: 2000000, Output: 64000},
	"grok-4.1-fast":              {Context: 2000000, Output: 64000},
	"grok-4.1-fast-reasoning":    {Context: 2000000, Output: 30000},
	"grok-4.1-fast-non-reasoning": {Context: 2000000, Output: 30000},
	"grok-4.3":                   {Context: 1000000, Output: 30000},
	"grok-3":                     {Context: 131072, Output: 8192},
	"grok-3-mini":                {Context: 131072, Output: 8192},

	// Mistral
	"mistral-large":       {Context: 128000, Output: 256000},
	"mistral-large-2411":  {Context: 128000, Output: 32768},
	"mistral-large-2512":  {Context: 262144, Output: 256000},
	"mistral-small":       {Context: 256000, Output: 256000},
	"mistral-small-2603":  {Context: 256000, Output: 256000},
	"mistral-medium":      {Context: 131072, Output: 32768},
	"mistral-medium-2505": {Context: 131072, Output: 32768},
	"mistral-nemo":        {Context: 128000, Output: 128000},
	"codestral":           {Context: 256000, Output: 4096},
	"codestral-2508":      {Context: 256000, Output: 32768},

	// Qwen
	"qwen-max":              {Context: 32768, Output: 8192},
	"qwen-plus":             {Context: 1000000, Output: 32768},
	"qwen-turbo":            {Context: 1000000, Output: 16384},
	"qwen-flash":            {Context: 1000000, Output: 32768},
	"qwen3-max":             {Context: 262144, Output: 65536},
	"qwen3-32b":             {Context: 40960, Output: 16384},
	"qwen3-235b-a22b":       {Context: 262144, Output: 16384},
	"qwen3-coder-480b":      {Context: 262144, Output: 65536},
	"qwq-32b":               {Context: 131072, Output: 16384},

	// Kimi
	"kimi-k2":          {Context: 131072, Output: 16384},
	"kimi-k2-thinking": {Context: 262144, Output: 262144},
	"kimi-k2.5":        {Context: 262144, Output: 262144},
	"kimi-k2.6":        {Context: 262144, Output: 262144},

	// GLM
	"glm-4.5":     {Context: 131072, Output: 98304},
	"glm-4.5-air": {Context: 131072, Output: 98304},
	"glm-4.6":     {Context: 204800, Output: 131072},
	"glm-4.7":     {Context: 204800, Output: 131072},
	"glm-4.7-flash": {Context: 200000, Output: 131072},
	"glm-5":       {Context: 202752, Output: 131072},
	"glm-5.1":     {Context: 200000, Output: 131072},

	// MiniMax
	"minimax-m2":   {Context: 196608, Output: 128000},
	"minimax-m2.1": {Context: 204800, Output: 131072},
	"minimax-m2.5": {Context: 204800, Output: 131072},
	"minimax-m2.7": {Context: 204800, Output: 131072},

	// Meta Llama
	"llama-3.1-8b-instruct":   {Context: 131072, Output: 16384},
	"llama-3.1-70b-instruct":  {Context: 131072, Output: 16384},
	"llama-3.1-405b-instruct": {Context: 131072, Output: 16384},
	"llama-3.3-70b-instruct":  {Context: 131072, Output: 16384},
	"llama-4-scout":           {Context: 327680, Output: 16384},
	"llama-4-maverick":        {Context: 1048576, Output: 16384},

	// Other
	"mixtral-8x7b":   {Context: 32768, Output: 32768},
	"mixtral-8x22b":  {Context: 65536, Output: 65536},
}

// GetDefault returns the model limit from the embedded defaults map.
// Uses exact match only — no prefix/substring matching.
func GetDefault(modelID string) (contextTokens int64, outputTokens int64) {
	if limit, ok := defaultLimits[modelID]; ok {
		return limit.Context, limit.Output
	}
	return 0, 0
}
