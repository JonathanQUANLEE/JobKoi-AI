import { Check } from "lucide-react";
import { SKILL_CHIPS } from "./types";

interface PolishSkillChipsProps {
  activeSkills: string[];
  onToggleSkill: (id: string) => void;
}

export default function PolishSkillChips({ activeSkills, onToggleSkill }: PolishSkillChipsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-stone-300 flex items-center gap-1.5">
          <span>精修技能包 (点击开启/关闭)</span>
        </span>
        <span className="text-[10px] text-stone-500 font-mono">
          {activeSkills.length}/{SKILL_CHIPS.length} 已激活
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SKILL_CHIPS.map((skill) => {
          const active = activeSkills.includes(skill.id);
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => onToggleSkill(skill.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all cursor-pointer select-none border ${
                active
                  ? skill.activeColor
                  : "bg-stone-900/60 border-stone-800 text-stone-400 hover:border-stone-700"
              }`}
              title={skill.desc}
            >
              <span
                className={`size-1.5 rounded-full ${
                  active ? skill.dotColor : "bg-stone-600"
                }`}
              />
              <span className="font-medium text-[11px]">{skill.short}</span>
              {active && <Check className="size-2.5 ml-0.5 opacity-80" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
