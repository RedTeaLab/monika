/**
 * StatisticsCharts Component
 *
 * Visual component for displaying session statistics including:
 * - Message distribution by visibility
 * - Roll success/failure rates
 * - Skill usage breakdown
 * - Hourly activity patterns
 * - Player performance comparison
 */

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { SessionStatistics } from '@/types/session'

// Color palette for charts
const COLORS = {
  public: '#22c55e', // green
  kp: '#a855f7', // purple
  party: '#3b82f6', // blue
  private: '#f97316', // orange
  success: '#22c55e',
  failure: '#ef4444',
  critical: '#eab308',
  pushed: '#6366f1',
}

interface StatisticsChartsProps {
  statistics: SessionStatistics | undefined
  className?: string
  breakpoint?: 'mobile' | 'tablet' | 'desktop'
}

/**
 * Get grid columns based on breakpoint
 */
const getGridCols = (breakpoint?: string): string => {
  switch (breakpoint) {
    case 'mobile':
      return 'grid-cols-1'
    case 'tablet':
      return 'grid-cols-2'
    case 'desktop':
    default:
      return 'grid-cols-2'
  }
}

/**
 * Calculate peak hour from hourly frequency data
 */
const getPeakHour = (hourlyFrequency: Record<number, number>): string => {
  const entries = Object.entries(hourlyFrequency)
  if (entries.length === 0) return '--'

  const peak = entries.reduce((max, [hour, count]) =>
    count > max[1] ? [hour, count] : max
  , ['0', 0])

  return `${peak[0]}:00`
}

/**
 * Format percentage
 */
const formatPercent = (value: number): string => `${Math.round(value * 100)}%`

export function StatisticsCharts({
  statistics,
  className = '',
  breakpoint = 'desktop',
}: StatisticsChartsProps) {
  // Handle undefined statistics
  if (!statistics) {
    return (
      <div className={`space-y-6 ${className}`}>
        <h2 className="text-2xl font-bold">Session Statistics</h2>
        <div className="text-muted-foreground">No statistics available</div>
      </div>
    )
  }

  // Prepare message distribution data
  const messageData = [
    { name: 'Public', value: statistics.messages.public_messages },
    { name: 'KP Only', value: statistics.messages.kp_only_messages },
    { name: 'Party', value: statistics.messages.party_messages },
    { name: 'Private', value: statistics.messages.private_messages },
  ].filter(item => item.value > 0)

  // Prepare roll statistics data
  const rollData = [
    { name: 'Success', value: statistics.rolls.successful_rolls, fill: COLORS.success },
    { name: 'Failure', value: statistics.rolls.failed_rolls, fill: COLORS.failure },
    { name: 'Critical Success', value: statistics.rolls.critical_successes, fill: COLORS.critical },
    { name: 'Critical Failure', value: statistics.rolls.critical_failures, fill: '#dc2626' },
    { name: 'Pushed', value: statistics.rolls.pushed_rolls, fill: COLORS.pushed },
  ]

  // Prepare skill usage data (top 10)
  const skillData = statistics.rolls.skill_usage.slice(0, 10).map(item => ({
    skill: item.skill,
    count: item.count,
  }))

  // Prepare hourly activity data
  const hourlyData = Object.entries(statistics.messages.hourly_frequency)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([hour, count]) => ({
      hour: `${hour}:00`,
      count,
    }))

  // Prepare player performance data
  const playerData = statistics.players.map(player => ({
    name: `Player ${player.player_id}`,
    rolls: player.roll_count,
    messages: player.message_count,
    sanLoss: player.total_san_loss,
    luckSpent: player.total_luck_spent,
  }))

  const gridCols = getGridCols(breakpoint)

  return (
    <div className={`space-y-6 ${className}`}>
      <h2 className="text-2xl font-bold">Session Statistics</h2>

      <div className={`grid ${gridCols} gap-6`}>
        {/* Message Distribution Chart */}
        <div className="bg-card rounded-lg p-4 border">
          <h3 className="text-lg font-semibold mb-4">Message Distribution</h3>
          {statistics.messages.total_messages > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={messageData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {messageData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={Object.values(COLORS)[index % Object.values(COLORS).length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No messages
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div>Total: {statistics.messages.total_messages}</div>
            <div>Public: {statistics.messages.public_messages}</div>
            <div>KP Only: {statistics.messages.kp_only_messages}</div>
            <div>Party: {statistics.messages.party_messages}</div>
            <div>Private: {statistics.messages.private_messages}</div>
          </div>
        </div>

        {/* Roll Success Rate Chart */}
        <div className="bg-card rounded-lg p-4 border">
          <h3 className="text-lg font-semibold mb-4">Roll Success Rate</h3>
          {statistics.rolls.total_rolls > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={rollData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#8884d8">
                  {rollData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No rolls
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div>Total Rolls: {statistics.rolls.total_rolls}</div>
            <div>Success Rate: {formatPercent(statistics.rolls.success_rate)}</div>
            <div>Critical Successes: {statistics.rolls.critical_successes}</div>
            <div>Critical Failures: {statistics.rolls.critical_failures}</div>
            <div>Pushed Rolls: {statistics.rolls.pushed_rolls}</div>
          </div>
        </div>

        {/* Skill Usage Chart */}
        <div className="bg-card rounded-lg p-4 border">
          <h3 className="text-lg font-semibold mb-4">Skill Usage</h3>
          {skillData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={skillData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="skill" type="category" width={100} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No skill usage data
            </div>
          )}
          {skillData.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {skillData.slice(0, 5).map(item => (
                <span
                  key={item.skill}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-secondary rounded text-xs"
                >
                  {item.skill}: {item.count}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Hourly Activity Chart */}
        <div className="bg-card rounded-lg p-4 border">
          <h3 className="text-lg font-semibold mb-4">Hourly Activity</h3>
          {hourlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#8884d8"
                  strokeWidth={2}
                  dot={{ fill: '#8884d8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No activity data
            </div>
          )}
          <div className="mt-4 text-sm">
            <div>Peak Activity: {getPeakHour(statistics.messages.hourly_frequency)}</div>
          </div>
        </div>

        {/* Player Performance Chart */}
        {statistics.players.length > 0 && (
          <div className="bg-card rounded-lg p-4 border col-span-full">
            <h3 className="text-lg font-semibold mb-4">Player Performance</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={playerData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="rolls" name="Rolls" fill="#8884d8" />
                <Bar dataKey="messages" name="Messages" fill="#82ca9d" />
                <Bar dataKey="sanLoss" name="SAN Loss" fill="#ef4444" />
                <Bar dataKey="luckSpent" name="Luck Spent" fill="#eab308" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {statistics.players.map(player => (
                <div key={player.player_id} className="text-sm p-2 bg-secondary rounded">
                  <div className="font-semibold">Player {player.player_id}</div>
                  <div>Actions: {player.total_actions}</div>
                  <div>Rolls: {player.roll_count}</div>
                  <div>Messages: {player.message_count}</div>
                  <div>SAN Loss: {player.total_san_loss}</div>
                  <div>Luck Spent: {player.total_luck_spent}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default StatisticsCharts
