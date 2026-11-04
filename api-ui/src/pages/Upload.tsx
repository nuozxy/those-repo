import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Section } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { ErrorBox, Skeleton } from '@/components/Feedback';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';

const EXTRA_FIELDS: Record<string, string> = {
  source: '来源', medium: '媒介 / 处理', codec: '视频编码', audiocodec: '音频编码',
  standard: '分辨率', processing: '处理方式', team: '制作组',
};

export default function Upload() {
  const toast = useToast();
  const secs = useAsync<Section[]>(() => api.sections(), []);
  const [sec, setSec] = useState('');
  const [form, setForm] = useState<Record<string, string>>({ descr: '', pos_state: 'normal', pick_type: 'normal', uplver: 'no' });
  const [tags, setTags] = useState<number[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [nfo, setNfo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ id: number } | null>(null);

  const section = useMemo(() => {
    const list = secs.data || [];
    return list.find((s) => s.name === sec) || list[0];
  }, [secs.data, sec]);

  function f(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!file) return setErr('请选择 .torrent 文件');
    if (!form.name?.trim()) return setErr('请填写标题');
    if (!form.descr?.trim()) return setErr('请填写描述');
    if (!form.type) return setErr('请选择分类');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (nfo) fd.append('nfo', nfo);
      Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
      if (tags.length) fd.append('tags', tags.join(','));
      const r = await api.upload(fd);
      setDone({ id: r.id });
      toast('发布成功', 'ok');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发布失败');
      toast('发布失败', 'err');
    } finally { setBusy(false); }
  }

  if (done) return (
    <div className="state state-ok">
      <div className="state-ico"><Icon name="check" size={26} /></div>
      <div className="state-t">种子发布成功</div>
      <p>ID #{done.id} 已写入站点</p>
      <div className="row-btns">
        <Link className="btn primary" to={`/t/${done.id}`}><Icon name="film" size={16} /> 查看详情</Link>
        <button className="btn" onClick={() => { setDone(null); setFile(null); }}><Icon name="upload" size={16} /> 再发一个</button>
      </div>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div><h1>发布种子</h1><p className="page-sub">表单选项全部来自分区列表接口，提交走官方发布接口</p></div>
        <span className="api-tag"><Icon name="link" size={13} /> GET /sections + POST /upload</span>
      </div>

      {secs.loading && <div className="panel pad"><Skeleton h={20} w="30%" /><Skeleton h={42} /><Skeleton h={42} /></div>}
      {secs.error && <ErrorBox text={secs.error} onRetry={secs.reload} />}

      {section && (
        <form className="upform" onSubmit={submit}>
          <section className="panel pad">
            <div className="panel-h"><Icon name="file" size={16} /> 基本信息</div>
            <div className="fgrid">
              <label className="field"><span>分区</span>
                <select value={section.name} onChange={(e) => { setSec(e.target.value); f('type', ''); }}>
                  {(secs.data || []).map((s) => <option key={s.id} value={s.name}>{s.display_name}（{s.name}）</option>)}
                </select>
              </label>
              <label className="field"><span>分类 <em>type · 必填</em></span>
                <select value={form.type || ''} onChange={(e) => f('type', e.target.value)}>
                  <option value="">请选择分类</option>
                  {section.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="field span2"><span>标题 <em>name · 必填</em></span>
                <input value={form.name || ''} onChange={(e) => f('name', e.target.value)} placeholder="完整资源名称" />
              </label>
              <label className="field span2"><span>副标题 <em>small_descr</em></span>
                <input value={form.small_descr || ''} onChange={(e) => f('small_descr', e.target.value)} placeholder="一句话简介 / 原刊名" />
              </label>
            </div>
          </section>

          <section className="panel pad">
            <div className="panel-h"><Icon name="stack" size={16} /> 子分类 <span className="panel-n">来自 /sections</span></div>
            <div className="fgrid">
              {section.sub_categories.map((sc) => (
                <label className="field" key={sc.field}>
                  <span>{sc.label} <em>{sc.field}</em></span>
                  <select value={form[sc.field] || ''} onChange={(e) => f(sc.field, e.target.value)}>
                    <option value="">不限</option>
                    {sc.data.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {!!section.tags.length && (
              <div className="tagpick">
                <span className="tagpick-l">标签 <em>tags</em></span>
                <div className="tags">
                  {section.tags.map((tag) => (
                    <button type="button" key={tag.id}
                      className={`tag pick ${tags.includes(tag.id) ? 'on' : ''}`}
                      style={tags.includes(tag.id) ? { background: tag.color, color: tag.font_color || '#fff' } : undefined}
                      onClick={() => setTags((v) => v.includes(tag.id) ? v.filter((x) => x !== tag.id) : [...v, tag.id])}>
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="panel pad">
            <div className="panel-h"><Icon name="film" size={16} /> 描述与文件</div>
            <div className="fgrid">
              <label className="field span2"><span>描述 <em>descr · 必填 · 支持 BBCode</em></span>
                <textarea rows={6} value={form.descr || ''} onChange={(e) => f('descr', e.target.value)} placeholder="资源介绍、截图链接等" />
              </label>
              <label className="field span2"><span>MediaInfo <em>technical_info</em></span>
                <textarea rows={3} value={form.technical_info || ''} onChange={(e) => f('technical_info', e.target.value)} placeholder="粘贴 MediaInfo 文本" />
              </label>
              <label className="field"><span>IMDB 链接 <em>url</em></span>
                <input value={form.url || ''} onChange={(e) => f('url', e.target.value)} placeholder="https://www.imdb.com/title/..." />
              </label>
              <label className="field"><span>PTGen 链接 <em>pt_gen</em></span>
                <input value={form.pt_gen || ''} onChange={(e) => f('pt_gen', e.target.value)} placeholder="豆瓣 / PTGen 链接" />
              </label>
              <label className="field"><span>种子文件 <em>file · 必填</em></span>
                <input type="file" accept=".torrent" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              <label className="field"><span>NFO 文件 <em>nfo</em></span>
                <input type="file" accept=".nfo,.txt" onChange={(e) => setNfo(e.target.files?.[0] || null)} />
              </label>
            </div>
          </section>

          <section className="panel pad">
            <div className="panel-h"><Icon name="settings" size={16} /> 高级选项</div>
            <div className="fgrid">
              <label className="field"><span>置顶 <em>pos_state</em></span>
                <select value={form.pos_state || 'normal'} onChange={(e) => f('pos_state', e.target.value)}>
                  <option value="normal">普通</option><option value="sticky">一级置顶</option><option value="r_sticky">二级置顶</option>
                </select>
              </label>
              <label className="field"><span>推荐 <em>pick_type</em></span>
                <select value={form.pick_type || 'normal'} onChange={(e) => f('pick_type', e.target.value)}>
                  <option value="normal">普通</option><option value="hot">热门</option><option value="classic">经典</option><option value="recommended">推荐</option>
                </select>
              </label>
              <label className="field"><span>价格（魔力）<em>price</em></span>
                <input type="number" value={form.price || ''} onChange={(e) => f('price', e.target.value)} placeholder="0" />
              </label>
              <label className="field"><span>匿名发布 <em>uplver</em></span>
                <select value={form.uplver || 'no'} onChange={(e) => f('uplver', e.target.value)}>
                  <option value="no">否</option><option value="yes">是</option>
                </select>
              </label>
            </div>
          </section>

          {err && <div className="login-err"><Icon name="alert" size={15} />{err}</div>}
          <div className="upsubmit">
            <span className="muted">提交后由原站写入种子库，权限与扣费规则完全沿用原站</span>
            <button className="btn primary" disabled={busy} type="submit">
              <Icon name="upload" size={16} /> {busy ? '发布中…' : '发布种子'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
