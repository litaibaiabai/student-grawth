"""六育+日常+荣誉 综合成绩参考算法（纯Python 3.9+；可独立运行）"""
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Mapping

DIMS = ('D', 'Z', 'T', 'M', 'L', 'G')  # 德智体美劳故事
HONOR_POINTS = {
    ('PROVINCE', 'FIRST'): 9, ('PROVINCE', 'SECOND'): 8, ('PROVINCE', 'THIRD'): 7,
    ('CITY', 'FIRST'): 6, ('CITY', 'SECOND'): 5, ('CITY', 'THIRD'): 4,
    ('DISTRICT', 'FIRST'): 3, ('DISTRICT', 'SECOND'): 2, ('DISTRICT', 'THIRD'): 1,
}

@dataclass(frozen=True)
class Certificate:
    event_key: str
    level: str
    rank: str
    approved: bool = True


def calculate(
    base_grades: Mapping[str, object],
    teacher_count: int,
    scan_count: int,
    reversal_count: int,
    certificates: Iterable[Certificate],
    *,
    base_weight='0.80',
    process_weight='0.15',
    honor_weight='0.05',
    process_full_points=20,
    honor_full_points=12,
):
    """基于已审核、去重的数据计算；0分不等于缺失成绩。"""
    dec = lambda x: Decimal(str(x))
    if set(base_grades) != set(DIMS):
        raise ValueError('六育成绩必须完整包含德智体美劳故事六项')
    values = [dec(base_grades[k]) for k in DIMS]
    if any((not x.is_finite()) or x < 0 or x > 100 for x in values):
        raise ValueError('各维度成绩必须在0~100之间')
    if any(type(n) is not int or n < 0 for n in (teacher_count, scan_count, reversal_count)):
        raise ValueError('日常加分次数必须为非负整数')
    if reversal_count > teacher_count + scan_count:
        raise ValueError('冲销次数不能大于原始加分次数')
    if process_full_points <= 0 or honor_full_points <= 0:
        raise ValueError('满分目标必须大于0')
    w1, w2, w3 = map(dec, (base_weight, process_weight, honor_weight))
    if min(w1, w2, w3) < 0 or w1 + w2 + w3 != 1:
        raise ValueError('权重应为非负且总和为1')

    # 同一event_key只允许一个正式有效奖状；由持久层唯一约束保证。
    event_keys = set()
    honor_raw = 0
    for cert in certificates:
        if not cert.approved:
            continue
        if cert.event_key in event_keys:
            raise ValueError(f'同一成果重复计奖状：{cert.event_key}')
        event_keys.add(cert.event_key)
        try:
            honor_raw += HONOR_POINTS[(cert.level, cert.rank)]
        except KeyError as exc:
            raise ValueError('奖状层级或奖次非法') from exc

    base = sum(values) / Decimal(6)
    net_points = teacher_count + scan_count - reversal_count
    process = min(Decimal(100), dec(net_points) * 100 / dec(process_full_points))
    honor = min(Decimal(100), dec(honor_raw) * 100 / dec(honor_full_points))
    result = min(Decimal(100), max(Decimal(0), base*w1 + process*w2 + honor*w3))
    round2 = lambda x: x.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return {
        'base_percent': round2(base),
        'net_daily_points': net_points,
        'process_percent': round2(process),
        'honor_raw_points': honor_raw,
        'honor_percent': round2(honor),
        'final_score': round2(result),
    }


if __name__ == '__main__':
    scores = {'D': 88, 'Z': 90, 'T': 86, 'M': 92, 'L': 84, 'G': 90}
    certificates = [Certificate('EVENT_A', 'CITY', 'SECOND'),
                    Certificate('EVENT_B', 'DISTRICT', 'FIRST')]
    example = calculate(scores, 12, 8, 0, certificates)
    print(example)
    assert example['final_score'] == Decimal('89.00'), example

    # 重复奖状须被拒绝
    try:
        calculate(scores, 0, 0, 0, [certificates[0], certificates[0]])
        raise AssertionError('未阻止重复奖状')
    except ValueError:
        pass

    # 超过目标后过程百分制封顶100
    over_cap = calculate(scores, 30, 25, 0, [])
    assert over_cap['process_percent'] == Decimal('100.00')
    print('示例与边界测试通过')
