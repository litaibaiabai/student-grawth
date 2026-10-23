-- 综合成绩单人查询：MySQL 8.0+
-- 依赖：01_综合评分新增表.sql 和 V3.score_record
-- 六育正式分完整且6项都已确认才返回 final_score；缺失不可直接视作0。
USE student_growth;
SET @student_id = 10001; -- 替换真实学生ID
SET @term_id = 1;        -- 替换真实学期ID

WITH
base_grade AS (
  SELECT student_id, term_id,
         COUNT(*) AS confirmed_dimensions,
         AVG(grade) AS base_percent
  FROM grade
  WHERE grade_status = 'CONFIRMED'
    AND student_id = @student_id AND term_id = @term_id
  GROUP BY student_id, term_id
),
process_score AS (
  SELECT student_id, term_id,
         SUM(score_delta) AS net_points,
         SUM(CASE WHEN source_type='A_DIRECT' THEN 1 ELSE 0 END) AS teacher_count,
         SUM(CASE WHEN source_type='B_CARD' THEN 1 ELSE 0 END) AS scan_count,
         SUM(CASE WHEN source_type='REVERSAL' THEN 1 ELSE 0 END) AS reversal_count
  FROM score_record
  WHERE student_id = @student_id AND term_id = @term_id
  GROUP BY student_id, term_id
),
honor_score AS (
  SELECT student_id, term_id,
         COUNT(*) AS approved_certificates,
         SUM(honor_points) AS honor_raw_points
  FROM honor
  WHERE review_status = 'APPROVED'
    AND student_id = @student_id AND term_id = @term_id
  GROUP BY student_id, term_id
),
normalized AS (
  SELECT r.term_id, @student_id AS student_id, r.rule_version,
         COALESCE(b.confirmed_dimensions,0) AS confirmed_dimensions,
         b.base_percent,
         COALESCE(p.teacher_count,0) AS teacher_count,
         COALESCE(p.scan_count,0) AS scan_count,
         COALESCE(p.reversal_count,0) AS reversal_count,
         COALESCE(p.net_points,0) AS net_points,
         LEAST(100.0, GREATEST(0.0,
           100.0 * COALESCE(p.net_points,0) / r.process_full_points
         )) AS process_percent,
         COALESCE(h.approved_certificates,0) AS approved_certificates,
         COALESCE(h.honor_raw_points,0) AS honor_raw_points,
         LEAST(100.0, GREATEST(0.0,
           100.0 * COALESCE(h.honor_raw_points,0) / r.honor_full_points
         )) AS honor_percent,
         r.base_weight, r.process_weight, r.honor_weight
  FROM score_rule r
  LEFT JOIN base_grade b ON b.term_id = r.term_id
  LEFT JOIN process_score p ON p.term_id = r.term_id
  LEFT JOIN honor_score h ON h.term_id = r.term_id
  WHERE r.term_id = @term_id
)
SELECT student_id, term_id, rule_version,
       CASE WHEN confirmed_dimensions=6 THEN 'READY' ELSE 'INCOMPLETE' END AS calculation_status,
       confirmed_dimensions,
       ROUND(base_percent,2) AS base_percent,
       teacher_count, scan_count, reversal_count, net_points,
       ROUND(process_percent,2) AS process_percent,
       approved_certificates, honor_raw_points,
       ROUND(honor_percent,2) AS honor_percent,
       CASE WHEN confirmed_dimensions=6 THEN
          ROUND(LEAST(100.0,GREATEST(0.0,
             base_percent*base_weight +
             process_percent*process_weight +
             honor_percent*honor_weight
          )),2)
       ELSE NULL END AS final_score
FROM normalized;

-- 重要约束：
-- 1. A/B每笔是+1，冲销每笔-1；无记名卡成功扫码后永久失效。
-- 2. 奖状只认APPROVED；同一活动成果只录一次，按最高有效奖次认定。
-- 3. 日常积分和奖状分独立，不要把奖状分插入score_record二次累计。
-- 4. 学期规则不要直接覆盖；正式发布时应保存结果快照与规则版本。
-- 5. 此查询尚未经MySQL实库执行；上线前需联调、异常与并发测试。
