import { useEffect, useMemo, useRef, useState } from "react";
import { clamp } from "../utils/commonUtils";
import { createCardLabelMap } from "../utils/activityUtils";
import { createPlaybackState } from "../utils/playbackUtils";
import {
  activePositionToTimestamp,
  annotateEventsForActiveTimeline,
  buildActiveIntervals,
  getActiveTimelineDuration,
  timestampToActivePosition
} from "../utils/activeTimelineUtils";

function usePlaybackClock({
  playing,
  setPlaying,
  position,
  setPosition,
  speed,
  duration,
  enabled
}) {
  const frameRef = useRef(null);
  const previousFrameRef = useRef(null);

  useEffect(() => {
    if (!playing || !enabled || duration <= 0) return undefined;

    const animate = (frameTime) => {
      if (previousFrameRef.current === null) {
        previousFrameRef.current = frameTime;
      }

      const delta = frameTime - previousFrameRef.current;
      previousFrameRef.current = frameTime;

      setPosition((previous) => {
        const next = previous + delta * speed;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      previousFrameRef.current = null;
    };
  }, [playing, enabled, duration, speed, setPlaying, setPosition]);

  useEffect(() => {
    if (position <= duration) return;
    setPosition(duration);
  }, [position, duration, setPosition]);
}

/**
 * 「誰かがオンラインだった時間」だけをつないだタイムラインと、
 * 通常タイムラプス・振り返りタイムラプスの再生状態を管理する。
 */
export default function useActiveTimeline({
  activitySessions,
  boardMeta,
  activityEvents
}) {
  const [timelapseOpen, setTimelapseOpen] = useState(false);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(300);
  const [isPlaying, setIsPlaying] = useState(false);

  const [reflectionActivityEvents, setReflectionActivityEvents] = useState([]);
  const [reflectionPlaybackPosition, setReflectionPlaybackPosition] = useState(0);
  const [reflectionPlaybackSpeed, setReflectionPlaybackSpeed] = useState(300);
  const [reflectionIsPlaying, setReflectionIsPlaying] = useState(false);
  const [selectedReflectionKeypointId, setSelectedReflectionKeypointId] = useState(null);

  const activeIntervals = useMemo(() => buildActiveIntervals(activitySessions, {
    cutoff: boardMeta?.activityClosedAt || boardMeta?.endedAt || null,
    historyEvents
  }), [activitySessions, boardMeta?.activityClosedAt, boardMeta?.endedAt, historyEvents]);

  const timelineHistoryEvents = useMemo(
    () => annotateEventsForActiveTimeline(historyEvents, activeIntervals),
    [historyEvents, activeIntervals]
  );

  const playbackDuration = useMemo(
    () => getActiveTimelineDuration(activeIntervals),
    [activeIntervals]
  );

  const playbackState = useMemo(
    () => createPlaybackState(timelineHistoryEvents, playbackPosition),
    [timelineHistoryEvents, playbackPosition]
  );

  const playbackTimestamp = activePositionToTimestamp(playbackPosition, activeIntervals);

  const timelapseKeypoints = useMemo(() => {
    if (activeIntervals.length === 0) return [];

    return activityEvents
      .filter((event) => typeof event.timestamp === "number")
      .map((event) => {
        const positionMs = timestampToActivePosition(event.timestamp, activeIntervals);
        if (positionMs === null) return null;
        return {
          ...event,
          positionMs,
          percentage: playbackDuration > 0
            ? clamp((positionMs / playbackDuration) * 100, 0, 100)
            : 0
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.positionMs - b.positionMs);
  }, [activeIntervals, activityEvents, playbackDuration]);

  const activeTimelapseKeypoint = useMemo(() => {
    if (playbackTimestamp === null || timelapseKeypoints.length === 0) return null;
    let active = null;
    for (const keypoint of timelapseKeypoints) {
      if (keypoint.timestamp <= playbackTimestamp) active = keypoint;
      else break;
    }
    return active;
  }, [playbackTimestamp, timelapseKeypoints]);

  const reflectionPlaybackDuration = playbackDuration;
  const reflectionPlaybackState = useMemo(
    () => createPlaybackState(timelineHistoryEvents, reflectionPlaybackPosition),
    [timelineHistoryEvents, reflectionPlaybackPosition]
  );
  const reflectionPlaybackTimestamp = activePositionToTimestamp(
    reflectionPlaybackPosition,
    activeIntervals
  );

  const reflectionKeypoints = useMemo(() => {
    if (activeIntervals.length === 0) return [];

    return reflectionActivityEvents
      .filter((event) => typeof event.timestamp === "number")
      .map((event) => {
        const positionMs = timestampToActivePosition(event.timestamp, activeIntervals);
        if (positionMs === null) return null;
        return {
          ...event,
          positionMs,
          percentage: reflectionPlaybackDuration > 0
            ? clamp((positionMs / reflectionPlaybackDuration) * 100, 0, 100)
            : 0
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.positionMs - b.positionMs);
  }, [activeIntervals, reflectionActivityEvents, reflectionPlaybackDuration]);

  const activityCardLabelMap = useMemo(
    () => createCardLabelMap(activityEvents),
    [activityEvents]
  );
  const reflectionCardLabelMap = useMemo(
    () => createCardLabelMap(reflectionActivityEvents),
    [reflectionActivityEvents]
  );

  const activeReflectionKeypoint = useMemo(() => {
    if (reflectionPlaybackTimestamp === null || reflectionKeypoints.length === 0) return null;
    let active = null;
    for (const keypoint of reflectionKeypoints) {
      if (keypoint.timestamp <= reflectionPlaybackTimestamp) active = keypoint;
      else break;
    }
    return active;
  }, [reflectionPlaybackTimestamp, reflectionKeypoints]);

  const selectedReflectionKeypoint = useMemo(() => {
    if (!selectedReflectionKeypointId) return null;
    return reflectionKeypoints.find((event) => event.id === selectedReflectionKeypointId) || null;
  }, [selectedReflectionKeypointId, reflectionKeypoints]);

  const displayedReflectionKeypoint = selectedReflectionKeypoint || activeReflectionKeypoint;

  usePlaybackClock({
    playing: isPlaying,
    setPlaying: setIsPlaying,
    position: playbackPosition,
    setPosition: setPlaybackPosition,
    speed: playbackSpeed,
    duration: playbackDuration,
    enabled: timelineHistoryEvents.length > 0
  });

  usePlaybackClock({
    playing: reflectionIsPlaying,
    setPlaying: setReflectionIsPlaying,
    position: reflectionPlaybackPosition,
    setPosition: setReflectionPlaybackPosition,
    speed: reflectionPlaybackSpeed,
    duration: reflectionPlaybackDuration,
    enabled: timelineHistoryEvents.length > 0
  });

  const resetTimeline = () => {
    setTimelapseOpen(false);
    setHistoryEvents([]);
    setHistoryLoading(false);
    setPlaybackPosition(0);
    setIsPlaying(false);
    setReflectionActivityEvents([]);
    setReflectionPlaybackPosition(0);
    setReflectionIsPlaying(false);
    setSelectedReflectionKeypointId(null);
  };

  return {
    timelapseOpen,
    setTimelapseOpen,
    historyEvents,
    setHistoryEvents,
    historyLoading,
    setHistoryLoading,
    playbackPosition,
    setPlaybackPosition,
    playbackSpeed,
    setPlaybackSpeed,
    isPlaying,
    setIsPlaying,
    playbackDuration,
    playbackState,
    playbackTimestamp,
    timelapseKeypoints,
    activeTimelapseKeypoint,
    timelineHistoryEvents,
    reflectionActivityEvents,
    setReflectionActivityEvents,
    reflectionPlaybackPosition,
    setReflectionPlaybackPosition,
    reflectionPlaybackSpeed,
    setReflectionPlaybackSpeed,
    reflectionIsPlaying,
    setReflectionIsPlaying,
    reflectionPlaybackDuration,
    reflectionPlaybackState,
    reflectionPlaybackTimestamp,
    reflectionKeypoints,
    selectedReflectionKeypointId,
    setSelectedReflectionKeypointId,
    displayedReflectionKeypoint,
    activityCardLabelMap,
    reflectionCardLabelMap,
    resetTimeline
  };
}
