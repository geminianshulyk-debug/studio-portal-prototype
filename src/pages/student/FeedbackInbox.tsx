import { useState } from 'react';
import { useCmd, useDb, useStore, useUser } from '../../store';
import { Badge, Banner, Card, Empty, Html, PageHead } from '../../components/ui';
import { fmtDateTime, userName } from '../../lib/selectors';
import { isMilestoneUnit, unitMilestone, unitTask } from '../../types';

export default function FeedbackInbox() {
  const db = useDb(), user = useUser(), cmd = useCmd(), { setPage, setCourse } = useStore();
  const [unread, setUnread] = useState(false);
  const list = db.feedback.filter((f) => f.studentId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter((f) => !unread || !f.read);
  return (
    <>
      <PageHead title="Feedback inbox" sub="Rubric-based auto-feedback, instructor comments with annotations, and peer summaries — each tied to the task and version it belongs to."
        laws={['Nielsen — unread feedback is always visible', 'Common Region — one card per feedback artifact']}
        actions={<div className="row"><button className={`btn ${!unread ? 'primary' : ''}`} onClick={() => setUnread(false)}>All</button><button className={`btn ${unread ? 'primary' : ''}`} onClick={() => setUnread(true)}>Unread</button></div>} />
      <div className="col">
        {list.length === 0 && <Empty>No feedback yet — submit a quest to start the loop.</Empty>}
        {list.map((f) => {
          const task = db.tasks.find((t) => t.id === unitTask(f.unitId))!;
          const ms = isMilestoneUnit(f.unitId) ? task.group?.milestones.find((m) => m.id === unitMilestone(f.unitId)) : undefined;
          const art = ms ? db.artifacts.find((a) => a.taskId === task.id && a.milestoneId === ms.id) : undefined;
          return (
            <Card key={f.id} className={f.read ? '' : 'region'} title={<span>{!f.read && <Badge kind="danger">NEW</Badge>} {task.title}{ms ? ` · ${ms.title}` : ''} <span className="muted small">· version {f.version}</span></span>}
              actions={<><Badge kind={f.decision === 'pass' ? 'ok' : 'dangerweak'}>{f.total}% · {f.decision === 'pass' ? 'passed' : 'revise'}</Badge>{!f.read && <button className="btn sm" onClick={() => cmd.markFeedbackRead(f.id)}>Mark read</button>}</>}>
              <div className="small muted">{userName(db, f.byId)} · {fmtDateTime(f.createdAt)}</div>
              <h4 style={{ margin: '8px 0 2px' }}>Rubric auto-feedback</h4><p className="small">{f.autoSummary}</p>
              <table className="plain"><tbody>{task.rubric.map((k) => <tr key={k.id}><td>{k.text}</td><td style={{ width: 70 }}>{f.scores[k.id] ?? 0}/{k.max}</td></tr>)}</tbody></table>
              <h4 style={{ margin: '8px 0 2px' }}>Instructor</h4><Html html={f.comment} />
              {f.annotations.length > 0 && <div className="col" style={{ gap: 2 }}>{f.annotations.map((a) => <div key={a.id} className="small"><mark className="ann">{a.quote}</mark> → {a.comment}</div>)}</div>}
              {f.peerSummary && <><h4 style={{ margin: '8px 0 2px' }}>Peer evaluation summary</h4><p className="small">Average {f.peerSummary.avg.toFixed(1)}/5 from {f.peerSummary.count} peer rating(s){f.peerSummary.flagged ? ` · ${f.peerSummary.flagged} under instructor review (excluded)` : ''}.</p></>}
              {art && <Banner kind="ok">Merged milestone artifact published {fmtDateTime(art.publishedAt)}: {art.summary}</Banner>}
              {f.gradeHistory.length > 0 && <p className="small muted">Grade adjusted {f.gradeHistory.length}× — latest: {f.gradeHistory.at(-1)!.justification}</p>}
              <div style={{ marginTop: 8 }}><button className="btn sm" onClick={() => { setCourse(task.courseId); setPage('quests'); }}>Open quest →</button></div>
            </Card>);
        })}
      </div>
    </>
  );
}
