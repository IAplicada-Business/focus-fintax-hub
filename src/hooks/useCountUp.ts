import { useState, useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";

export function useCountUp(target: number, duration = 450) {
  const [value, setValue] = useState(0);
  const animatedOnce = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion() || duration <= 0) {
      setValue(target);
      animatedOnce.current = true;
      return;
    }

    if (animatedOnce.current) {
      setValue(target);
      return;
    }

    if (target === 0) {
      setValue(0);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(target * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        animatedOnce.current = true;
        setValue(target);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}
