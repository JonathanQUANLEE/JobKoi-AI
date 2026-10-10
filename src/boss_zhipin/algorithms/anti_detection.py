"""生物拟人化反风控算法套件 (Anti-Detection Biological Simulation).

算法设计与原理：
1. 泊松过程时间间隔 (Poisson Timing Distribution)：模拟人类阅读和点击的长尾时延特性，避免机械式均匀分布被招聘平台风控检测。
2. 三次贝塞尔拟人轨迹 (Cubic Bézier Curve)：根据肌肉力学生成非直线平滑变速位移点阵，用于自动化指针移动。
"""

from __future__ import annotations

import math
import random
from typing import List, Tuple


class AntiDetectionPolicy:
    @staticmethod
    def get_poisson_delay(expected_seconds: float = 3.0, min_delay: float = 1.0, max_delay: float = 12.0) -> float:
        """基于指数/泊松到达时间间隔生成长尾拟人化操作等待时长。
        
        人类行为特征：大部分操作在平均时间附近完成，小概率出现停留思考/阅读的长尾等待。
        """
        # 使用指数分布模拟无记忆泊松流间隔
        rate = 1.0 / max(0.5, expected_seconds)
        delay = random.expovariate(rate)
        # 加上轻微高斯白噪声
        delay += random.gauss(0, 0.25)
        # 截断在合理安全区间内
        clamped = max(min_delay, min(max_delay, delay))
        return round(clamped, 2)

    @staticmethod
    def generate_bezier_trajectory(
        start: Tuple[float, float],
        end: Tuple[float, float],
        steps: int = 25,
    ) -> List[Tuple[float, float]]:
        """生成三次贝塞尔曲线鼠标移动轨迹点阵（具有自然的起步加速和到达减速）。"""
        x0, y0 = start
        x3, y3 = end

        # 随机生成两个控制点，模拟手腕微小弧度晃动
        dx = x3 - x0
        dy = y3 - y0
        dist = math.hypot(dx, dy)

        offset = min(60.0, dist * 0.25)
        ctrl1_x = x0 + dx * 0.25 + random.uniform(-offset, offset)
        ctrl1_y = y0 + dy * 0.25 + random.uniform(-offset, offset)

        ctrl2_x = x0 + dx * 0.75 + random.uniform(-offset, offset)
        ctrl2_y = y0 + dy * 0.75 + random.uniform(-offset, offset)

        points: List[Tuple[float, float]] = []
        for i in range(steps + 1):
            t = i / steps
            # 引入缓动函数：t -> easeInOut(t)
            eased_t = t * t * (3.0 - 2.0 * t)

            u = 1.0 - eased_t
            # 三次贝塞尔公式: B(t) = (1-t)^3*P0 + 3*(1-t)^2*t*P1 + 3*(1-t)*t^2*P2 + t^3*P3
            x = (u**3) * x0 + 3 * (u**2) * eased_t * ctrl1_x + 3 * u * (eased_t**2) * ctrl2_x + (eased_t**3) * x3
            y = (u**3) * y0 + 3 * (u**2) * eased_t * ctrl1_y + 3 * u * (eased_t**2) * ctrl2_y + (eased_t**3) * y3
            points.append((round(x, 1), round(y, 1)))

        return points
