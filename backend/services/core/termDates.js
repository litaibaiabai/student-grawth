const day=v=>v instanceof Date?v.toISOString().slice(0,10):v?String(v).slice(0,10):null;
module.exports={day};
