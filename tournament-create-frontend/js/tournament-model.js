export const FORMATS = Object.freeze({
  single_elimination: '单败淘汰',
  double_elimination: '双败淘汰',
  round_robin: '循环赛',
});

export function validateTournament(values) {
  const errors = {};
  if (!values.name?.trim()) errors.name = '请输入赛事名称。';
  else if (values.name.trim().length > 80) errors.name = '赛事名称不能超过 80 个字符。';
  const start = new Date(values.start_time).getTime();
  const end = new Date(values.end_time).getTime();
  if (!values.start_time || !Number.isFinite(start)) errors.start_time = '请选择有效的开始时间。';
  if (!values.end_time || !Number.isFinite(end)) errors.end_time = '请选择有效的结束时间。';
  else if (Number.isFinite(start) && end <= start) errors.end_time = '结束时间必须晚于开始时间。';
  if (!Object.hasOwn(FORMATS, values.format)) errors.format = '请选择有效的比赛赛制。';
  if ((values.description || '').length > 1000) errors.description = '赛事说明不能超过 1000 个字符。';
  return errors;
}

export function toPayload(values) {
  const errors = validateTournament(values);
  if (Object.keys(errors).length) throw new Error('赛事信息不完整或无效。');
  return {
    name: values.name.trim(),
    start_time: new Date(values.start_time).toISOString(),
    end_time: new Date(values.end_time).toISOString(),
    format: values.format,
    description: (values.description || '').trim(),
  };
}
