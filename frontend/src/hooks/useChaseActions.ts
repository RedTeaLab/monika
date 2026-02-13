/**
 * React hook for chase action operations
 * Provides methods to interact with chase API endpoints
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { chaseApi } from '../lib/api';
import type {
  ChaseRoundRequest,
  ChaseRoundResponse,
  ChaseActionRequestItem,
  ChaseEndRequest,
  ChaseEndReason,
} from '../types/chase';

export function useChaseActions(chaseId: string | null) {
  const [isExecuting, setIsExecuting] = useState(false);

  /**
   * Execute a round of chase actions
   * Processes all participant actions for the current round
   * @param actions - Array of action requests from all participants
   * @returns ChaseRoundResponse with updated positions and chase status
   * @throws Error if no chase ID is provided
   */
  const executeRound = useCallback(async (
    actions: ChaseActionRequestItem[]
  ): Promise<ChaseRoundResponse> => {
    if (!chaseId) {
      throw new Error('No chase ID provided');
    }

    setIsExecuting(true);
    try {
      const request: ChaseRoundRequest = {
        actions,
      };

      const response = await chaseApi.executeRound(chaseId, request);

      // Show success message
      toast.success(`Round ${response.round} executed`);

      // Check if chase ended
      if (response.chase_ended) {
        const reason = response.end_reason || 'Chase ended';
        toast.info(reason);
      }

      return response;
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to execute round';
      toast.error(message);
      throw error;
    } finally {
      setIsExecuting(false);
    }
  }, [chaseId]);

  /**
   * Perform an obstacle check
   * Note: The backend doesn't have a separate obstacle check endpoint.
   * Obstacle checks are handled through the round execution with action_type='overcome_obstacle'.
   * This is a convenience method to create an obstacle action.
   * @param participantId - ID of the participant attempting the obstacle
   * @param obstacleId - ID of the obstacle to overcome
   * @param skillValue - Skill value for the check
   * @returns ChaseActionRequestItem to be included in executeRound actions array
   */
  const performObstacleCheck = useCallback((
    participantId: string,
    obstacleId: string,
    skillValue: number
  ): ChaseActionRequestItem => {
    return {
      participant_id: participantId,
      action_type: 'overcome_obstacle',
      obstacle_id: obstacleId,
      skill: skillValue,
    };
  }, []);

  /**
   * Create a skip turn action (decelerate with 0 movement)
   * This is a convenience method to create a skip action.
   * @param participantId - ID of the participant skipping their turn
   * @returns ChaseActionRequestItem to be included in executeRound actions array
   */
  const skipTurn = useCallback((
    participantId: string
  ): ChaseActionRequestItem => {
    return {
      participant_id: participantId,
      action_type: 'decelerate',
      skill: 0,
    };
  }, []);

  /**
   * Create an accelerate action
   * @param participantId - ID of the participant accelerating
   * @param skillValue - Optional skill value for the check
   * @returns ChaseActionRequestItem to be included in executeRound actions array
   */
  const accelerate = useCallback((
    participantId: string,
    skillValue?: number
  ): ChaseActionRequestItem => {
    return {
      participant_id: participantId,
      action_type: 'accelerate',
      skill: skillValue,
    };
  }, []);

  /**
   * Create a decelerate action
   * @param participantId - ID of the participant decelerating
   * @param skillValue - Optional skill value for the check
   * @returns ChaseActionRequestItem to be included in executeRound actions array
   */
  const decelerate = useCallback((
    participantId: string,
    skillValue?: number
  ): ChaseActionRequestItem => {
    return {
      participant_id: participantId,
      action_type: 'decelerate',
      skill: skillValue,
    };
  }, []);

  /**
   * Create an attack action
   * @param participantId - ID of the participant attacking
   * @param obstacleId - ID of the target (obstacle or participant)
   * @param skillValue - Optional skill value for the attack check
   * @returns ChaseActionRequestItem to be included in executeRound actions array
   */
  const attack = useCallback((
    participantId: string,
    obstacleId: string,
    skillValue?: number
  ): ChaseActionRequestItem => {
    return {
      participant_id: participantId,
      action_type: 'attack',
      obstacle_id: obstacleId,
      skill: skillValue,
    };
  }, []);

  /**
   * End the current chase session
   * @param reason - Why the chase is ending
   * @param failForwardScene - Optional scene description for fail-forward
   * @returns void (chase is ended)
   * @throws Error if no chase ID is provided
   */
  const endChase = useCallback(async (
    reason: ChaseEndReason,
    failForwardScene?: string
  ): Promise<void> => {
    if (!chaseId) {
      throw new Error('No chase ID provided');
    }

    setIsExecuting(true);
    try {
      const request: ChaseEndRequest = {
        reason,
        fail_forward_scene: failForwardScene,
      };

      await chaseApi.end(chaseId, request);

      // Show success message based on reason
      const messages: Record<ChaseEndReason, string> = {
        escaped: 'Target escaped successfully!',
        caught: 'Target was caught!',
        abandoned: 'Chase was abandoned',
        failed_forward: 'Chase ended',
      };
      toast.success(messages[reason] || 'Chase ended');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to end chase';
      toast.error(message);
      throw error;
    } finally {
      setIsExecuting(false);
    }
  }, [chaseId]);

  /**
   * Generate a new obstacle for the chase
   * @returns ObstacleResponse with generated obstacle data
   * @throws Error if no chase ID is provided
   */
  const generateObstacle = useCallback(async () => {
    if (!chaseId) {
      throw new Error('No chase ID provided');
    }

    setIsExecuting(true);
    try {
      const response = await chaseApi.generateObstacles(chaseId);
      toast.success(`New obstacle: ${response.name}`);
      return response;
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to generate obstacle';
      toast.error(message);
      throw error;
    } finally {
      setIsExecuting(false);
    }
  }, [chaseId]);

  return {
    isExecuting,
    executeRound,
    performObstacleCheck,
    skipTurn,
    accelerate,
    decelerate,
    attack,
    endChase,
    generateObstacle,
  };
}
