import { formatDate } from '../lib/format'
import type { Constraint, Contribution } from '../lib/types'

type SpotProps = {
  kind: 'spots'
  contributions: Contribution[]
  must: string[]
  want: string[]
  onAdopt: (field: 'must_spots' | 'want_spots', value: string) => void
}

type PlanProps = {
  kind: 'plans'
  contributions: Contribution[]
  constraints: Constraint[]
  roughPlans: string[]
  onAdoptConstraint: (value: Constraint) => void
  onAdoptRoughPlan: (dayIndex: number, value: string) => void
}

const sameConstraint = (a: Constraint, b: Constraint) =>
  a.content.trim() === b.content.trim() && a.date === b.date && a.time === b.time

function constraintText(row: Constraint) {
  return [row.date ? formatDate(row.date) : '', row.time, row.content].filter(Boolean).join(' ')
}

/**
 * 意見募集リンクから届いた追記を「〇〇さんの意見」として並べ、
 * 親ユーザーが［取り込む］を押した項目だけを自分の入力に加える。
 */
export default function ContributionPanel(props: SpotProps | PlanProps) {
  const rows = props.contributions.filter((item) =>
    props.kind === 'spots'
      ? item.must_spots.length > 0 || item.want_spots.length > 0
      : item.constraints.length > 0 || item.rough_plans.some((plan) => plan.trim()),
  )
  if (rows.length === 0) return null

  return (
    <div className="contrib">
      <p className="contrib__title">一緒に行く人からの意見</p>
      {rows.map((item) => (
        <div className="contrib__person" key={item.id}>
          <p className="contrib__name">{item.name}さんの意見</p>
          <ul className="contrib__list">
            {props.kind === 'spots' ? (
              <>
                {(['must_spots', 'want_spots'] as const).flatMap((field) =>
                  item[field].map((spot) => {
                    const adopted = props.must.includes(spot) || props.want.includes(spot)
                    return (
                      <li className="contrib__item" key={`${field}-${spot}`}>
                        <span className="contrib__tag">{field === 'must_spots' ? 'MUST' : 'WANT'}</span>
                        <span className="contrib__text">{spot}</span>
                        {adopted ? (
                          <span className="contrib__done">取り込み済み</span>
                        ) : (
                          <button type="button" className="field-shortcut" onClick={() => props.onAdopt(field, spot)}>
                            取り込む
                          </button>
                        )}
                      </li>
                    )
                  }),
                )}
              </>
            ) : (
              <>
                {item.constraints.map((row, index) => {
                  const adopted = props.constraints.some((current) => sameConstraint(current, row))
                  return (
                    <li className="contrib__item" key={`c-${index}`}>
                      <span className="contrib__tag">予約済み</span>
                      <span className="contrib__text">{constraintText(row)}</span>
                      {adopted ? (
                        <span className="contrib__done">取り込み済み</span>
                      ) : (
                        <button type="button" className="field-shortcut" onClick={() => props.onAdoptConstraint(row)}>
                          取り込む
                        </button>
                      )}
                    </li>
                  )
                })}
                {item.rough_plans.map((plan, index) => {
                  if (!plan.trim()) return null
                  const outOfRange = index >= props.roughPlans.length
                  const adopted = !outOfRange && props.roughPlans[index].includes(plan.trim())
                  return (
                    <li className="contrib__item" key={`r-${index}`}>
                      <span className="contrib__tag">{index + 1}日目</span>
                      <span className="contrib__text">{plan}</span>
                      {adopted ? (
                        <span className="contrib__done">取り込み済み</span>
                      ) : outOfRange ? (
                        <span className="contrib__done">日程外</span>
                      ) : (
                        <button
                          type="button"
                          className="field-shortcut"
                          onClick={() => props.onAdoptRoughPlan(index, plan.trim())}
                        >
                          取り込む
                        </button>
                      )}
                    </li>
                  )
                })}
              </>
            )}
          </ul>
        </div>
      ))}
    </div>
  )
}
