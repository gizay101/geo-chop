import React, { useEffect, useState } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

type Props = {
  to: number;
  decimals?: number;
  suffix?: string;
  /** ms after mount before counting starts. */
  delay?: number;
  duration?: number;
  style?: StyleProp<TextStyle>;
};

/** A number that rolls up from 0 with an ease-out (matches the tick timing in countup.wav). */
export function CountUp({ to, decimals = 1, suffix = "", delay = 0, duration = 1400, style }: Props) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const u = Math.min(1, (now - start) / duration);
      setValue(to * (1 - Math.pow(1 - u, 3)));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => (raf = requestAnimationFrame(step)), delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [to, delay, duration]);
  return (
    <Text style={style}>
      {value.toFixed(decimals)}
      {suffix}
    </Text>
  );
}
