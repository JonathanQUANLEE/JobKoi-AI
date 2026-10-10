import { useT } from "../../../store";

interface DrawerBasicTabProps {
  profiles: Array<{ name: string; path: string }>;
  profileName: string;
  setProfileName: (name: string) => void;
  onLoadProfile: (name: string) => void;
  usrName: string;
  setUsrName: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
  startUrl: string;
  setStartUrl: (v: string) => void;
}

export default function DrawerBasicTab({
  profiles,
  profileName,
  setProfileName,
  onLoadProfile,
  usrName,
  setUsrName,
  label,
  setLabel,
  startUrl,
  setStartUrl,
}: DrawerBasicTabProps) {
  const t = useT();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--grid)] bg-[var(--panel-2)] p-4 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">预设配置档切换</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">{t("field.currentProfile")}</label>
            <select
              className="field-select"
              value={profileName}
              onChange={(e) => {
                setProfileName(e.target.value);
                onLoadProfile(e.target.value);
              }}
            >
              {profiles.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">{t("field.profileName")}</label>
            <input
              className="field-input"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="gui-default"
            />
          </div>
        </div>

        <div className="border-t border-[var(--grid)] pt-3 space-y-3">
          <div>
            <label className="field-label">{t("field.userName")}</label>
            <input
              className="field-input"
              value={usrName}
              onChange={(e) => setUsrName(e.target.value)}
              placeholder="您的称呼（可选）"
            />
          </div>
          <div>
            <label className="field-label">{t("field.searchKeyword")}</label>
            <input
              className="field-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="默认检索关键词"
            />
          </div>
          <div>
            <label className="field-label">{t("field.startUrl")}</label>
            <input
              className="field-input"
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              placeholder="选填：自定义起始检索页面 URL"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
