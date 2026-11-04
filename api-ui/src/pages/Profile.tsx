import { Link, useParams } from 'react-router-dom';
import { api, type UserBrief } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { ErrorBox, Skeleton } from '@/components/Feedback';
import { Icon } from '@/components/Icon';
import { SmartImage } from '@/components/SmartImage';

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>{value ?? '—'}</b>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export default function Profile({ self = false }: { self?: boolean }) {
  const { id: idStr } = useParams();
  const uid = self ? undefined : Number(idStr);
  const p = useAsync<UserBrief>(() => api.profile(uid), [uid]);

  if (p.loading) return <div className="pad"><Skeleton h={120} r={14} /><Skeleton h={240} r={14} /></div>;
  if (p.error || !p.data) return <ErrorBox text={p.error || '用户不存在'} onRetry={p.reload} />;
  const u = p.data;
  const ratio = u.share_ratio === null || u.share_ratio === undefined || u.share_ratio === '' ? '—' : String(u.share_ratio);

  return (
    <>
      <div className="page-head">
        <div><h1>{self ? '我的资料' : u.username}</h1><p className="page-sub">数据来自用户详情接口，随登录令牌对应用户变化</p></div>
        <span className="api-tag"><Icon name="link" size={13} /> GET /profile{uid ? `/${uid}` : ''}</span>
      </div>

      <section className="panel profile">
        <div className="profile-top">
          <span className="profile-ava">
            <SmartImage src={u.avatar} w={160} h={160} fallback={<Icon name="user" size={34} />} />
          </span>
          <div className="profile-id">
            <h2>{u.username} <span className="uid">#{u.id}</span></h2>
            <div className="profile-class">{u.class_text || '用户'}</div>
            <div className="profile-sub">
              <span><Icon name="clock" size={13} /> 加入 {u.added_human || u.added || '—'}</span>
              <span><Icon name="refresh" size={13} /> 最后访问 {u.last_access_human || u.last_access || '—'}</span>
            </div>
          </div>
          {self && <Link className="btn sm" to="/bookmarks"><Icon name="star" size={15} /> 我的收藏</Link>}
        </div>
        <div className="statgrid">
          <Stat label="上传量" value={u.uploaded_text} />
          <Stat label="下载量" value={u.downloaded_text} />
          <Stat label="分享率" value={ratio} />
          <Stat label="魔力值" value={u.bonus_human ?? u.bonus?.toLocaleString()} />
          <Stat label="做种积分" value={u.seed_points_human ?? u.seed_points?.toLocaleString()} />
          <Stat label="时产魔力" value={u.seed_bonus_per_hour_human ?? u.seed_bonus_per_hour?.toLocaleString()} />
          <Stat label="做种时间" value={u.seedtime_text} />
          <Stat label="下载时间" value={u.leechtime_text} />
          <Stat label="邀请名额" value={u.invites ?? '—'} />
          <Stat label="考勤卡" value={u.attendance_card ?? '—'} />
        </div>
      </section>

      <div className="two-col">
        <section className="panel">
          <div className="panel-h"><Icon name="medal" size={16} /> 勋章 <span className="panel-n">{u.valid_medals?.length || 0}</span></div>
          {u.valid_medals?.length ? (
            <div className="medals">
              {u.valid_medals.map((m) => (
                <div className="medal" key={m.id}>
                  <SmartImage src={m.image_small} w={64} h={64} fallback={<Icon name="medal" size={22} />} />
                  <span>{m.name}</span>
                  <small>{m.wearing_status_text || m.get_type_text || ''}</small>
                </div>
              ))}
            </div>
          ) : <div className="muted pad">暂无有效勋章</div>}
        </section>

        <section className="panel">
          <div className="panel-h"><Icon name="users" size={16} /> 邀请人</div>
          {u.inviter ? (
            <Link to={`/u/${u.inviter.id}`} className="pub">
              <span className="pub-ava"><SmartImage src={u.inviter.avatar} w={80} h={80} fallback={<Icon name="user" size={18} />} /></span>
              <span><b>{u.inviter.username}</b><small>{u.inviter.class_text || '用户'}</small></span>
              <Icon name="chevR" size={16} />
            </Link>
          ) : <div className="muted pad">无邀请人信息</div>}
          <div className="kv kv-1 kv-pad">
            <div><span>账号状态</span><b>{u.status || '—'}</b></div>
            <div><span>启用</span><b>{u.enabled || '—'}</b></div>
            <div><span>最后登录</span><b>{u.last_login_human || u.last_login || '—'}</b></div>
          </div>
        </section>
      </div>
    </>
  );
}
