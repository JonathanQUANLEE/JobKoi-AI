import { motion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

export interface AnimatedNumberProps {
  value: number;
  className?: string;
  springOptions?: {
    mass?: number;
    stiffness?: number;
    damping?: number;
    duration?: number;
    bounce?: number;
  };
  decimalPlaces?: number;
  formatter?: (val: number) => string;
}

/**
 * AnimatedNumber: 丝滑数字滚动跳变组件
 * 用户打开界面时从 0 平缓跃迁至目标数值，缓动曲线优雅舒缓。
 */
export function AnimatedNumber({
  value,
  className,
  springOptions,
  decimalPlaces = 0,
  formatter,
}: AnimatedNumberProps) {
  // 选用较柔和的缓动弹簧（mass: 1, stiffness: 42, damping: 17），速度偏慢且沉稳
  const spring = useSpring(0, {
    mass: 1,
    stiffness: 42,
    damping: 17,
    ...springOptions,
  });

  const display = useTransform(spring, (current: number) => {
    if (formatter) return formatter(current);
    if (decimalPlaces > 0) {
      return current.toFixed(decimalPlaces);
    }
    return Math.round(current).toString();
  });

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={className}>{display}</motion.span>;
}
