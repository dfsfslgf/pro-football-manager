import { useState } from 'react';
import { Loader2, Globe2, Search } from 'lucide-react';
import useAuthStore from '../store/useAuthStore.js';
import { EMBLEM_COLORS, EMBLEM_ICONS } from '../constants/gameConfig.js';
import { FULL_LEAGUE_PRESETS } from '../constants/leagueClubsMaster.js';

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const error = useAuthStore((s) => s.error);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);

  const [mode, setMode] = useState('login');
  const [selectedLeague, setSelectedLeague] = useState(FULL_LEAGUE_PRESETS[0].code);
  const [clubSearch, setClubSearch] = useState('');
  const [form, setForm] = useState({
    nickname: '',
    password: '',
    clubName: FULL_LEAGUE_PRESETS[0].clubs[0].name.split(' (')[0],
    emblemIcon: EMBLEM_ICONS[0],
    emblemColor: EMBLEM_COLORS[0],
  });

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const currentLeagueObj = FULL_LEAGUE_PRESETS.find((l) => l.code === selectedLeague) || FULL_LEAGUE_PRESETS[0];
  const filteredClubs = currentLeagueObj.clubs.filter((c) =>
    c.name.toLowerCase().includes(clubSearch.trim().toLowerCase())
  );

  const handleSelectPresetClub = (clubPreset) => {
    const cleanClubName = clubPreset.name.split(' (')[0];
    setForm((f) => ({
      ...f,
      clubName: cleanClubName,
      emblemColor: EMBLEM_COLORS.includes(clubPreset.color) ? clubPreset.color : EMBLEM_COLORS[0],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mode === 'login') await login({ nickname: form.nickname.trim(), password: form.password });
    else await register({ ...form, nickname: form.nickname.trim(), clubName: form.clubName.trim() });
  };

  const inputClass =
    'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-4 text-slate-100">
      <div className="w-full max-w-xl space-y-5 rounded-2xl border border-slate-700 bg-slate-900/90 p-6 shadow-2xl">
        <header className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-emerald-300">Football Manager</p>
          <h1 className="mt-1 text-2xl font-black text-white">PRO FOOTBALL MANAGER</h1>
        </header>

        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-700">
          {[
            ['login', '로그인'],
            ['register', '리그/구단 선택 창단 (회원가입)'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              data-testid={`tab-${key}`}
              className={`px-3 py-2 text-xs font-bold transition ${
                mode === key ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-400">
              감독 닉네임
              <input
                className={`${inputClass} mt-1`}
                value={form.nickname}
                onChange={(e) => setField('nickname', e.target.value)}
                placeholder="2~16자 (문자/숫자/밑줄)"
                autoComplete="username"
                data-testid="input-nickname"
                required
              />
            </label>
            <label className="block text-xs font-semibold text-slate-400">
              비밀번호
              <input
                type="password"
                className={`${inputClass} mt-1`}
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
                placeholder="6자 이상"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                data-testid="input-password"
                required
              />
            </label>
          </div>

          {mode === 'register' && (
            <>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-300">
                    <Globe2 className="mr-1 inline h-3.5 w-3.5" /> 1. 플레이할 소속 리그 선택
                  </label>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    총 {currentLeagueObj.teamCount}개 구단 참가 리그
                  </span>
                </div>

                <select
                  value={selectedLeague}
                  onChange={(e) => {
                    const nextCode = e.target.value;
                    setSelectedLeague(nextCode);
                    setClubSearch('');
                    const found = FULL_LEAGUE_PRESETS.find((l) => l.code === nextCode);
                    if (found && found.clubs[0]) handleSelectPresetClub(found.clubs[0]);
                  }}
                  className={`${inputClass} mt-1.5`}
                >
                  {FULL_LEAGUE_PRESETS.map((lg) => (
                    <option key={lg.code} value={lg.code}>
                      {lg.name}
                    </option>
                  ))}
                </select>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-300">
                    2. 구단 선택 ({filteredClubs.length}/{currentLeagueObj.teamCount}팀)
                  </p>
                  <div className="relative w-44">
                    <Search className=" absolute left-2 top-2 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      value={clubSearch}
                      onChange={(e) => setClubSearch(e.target.value)}
                      placeholder="구단명 검색..."
                      className="w-full rounded-md border border-slate-700 bg-slate-900 py-1 pl-7 pr-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-2 grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {filteredClubs.map((c) => {
                    const shortClean = c.name.split(' (')[0];
                    const isSelected = form.clubName === shortClean;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectPresetClub(c)}
                        className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-bold transition ${
                          isSelected
                            ? 'border-emerald-400 bg-emerald-500/20 text-white'
                            : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">
                          {c.icon} {c.name}
                        </span>
                        <span className="ml-1 shrink-0 text-[10px] font-black text-emerald-400">OVR {c.ovr}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block text-xs font-semibold text-slate-400">
                최종 구단 등록명 (직접 커스텀 가능 · 2~20자)
                <input
                  className={`${inputClass} mt-1`}
                  value={form.clubName}
                  onChange={(e) => setField('clubName', e.target.value)}
                  placeholder="2~20자"
                  data-testid="input-club"
                  required
                />
              </label>

              <div>
                <p className="mb-1 text-xs font-semibold text-slate-400">구단 엠블럼 & 상징 컬러</p>
                <div className="flex flex-wrap gap-1.5">
                  {EMBLEM_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setField('emblemIcon', icon)}
                      className={`h-9 w-9 rounded-lg border text-lg ${
                        form.emblemIcon === icon
                          ? 'border-blue-400 bg-blue-500/20'
                          : 'border-slate-700 bg-slate-800 hover:bg-slate-700'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {EMBLEM_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setField('emblemColor', color)}
                      aria-label={`엠블럼 색상 ${color}`}
                      className={`h-6 w-6 rounded-full border-2 ${
                        form.emblemColor === color ? 'border-white' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <span
                    className="ml-3 flex h-10 w-10 items-center justify-center rounded-full border-2 text-xl"
                    style={{ borderColor: form.emblemColor, backgroundColor: `${form.emblemColor}33` }}
                  >
                    {form.emblemIcon}
                  </span>
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-200" data-testid="auth-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="auth-submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 py-2.5 text-sm font-black text-white hover:from-emerald-500 hover:to-blue-500 disabled:opacity-60"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'login' ? '로그인' : '선택한 리그 · 구단으로 시작하기'}
          </button>
        </form>
      </div>
    </div>
  );
}