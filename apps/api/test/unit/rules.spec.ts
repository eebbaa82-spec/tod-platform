import { canonical } from '../../src/common/audit.service';
import { decryptField, encryptField, maskIdentifier } from '../../src/common/crypto';
import { splitCommission } from '../../src/common/money';
import { normalisePhone } from '../../src/common/phone';
import { addWorkingDays, isWorkingDay } from '../../src/common/working-days';
import { maskContacts } from '../../src/messaging/masking';

describe('money', () => {
  it('splits commission in whole santim', () => {
    expect(splitCommission(350000, 0.05)).toMatchObject({ commission: 17500, net: 332500 });
    expect(splitCommission(333, 0.05).commission + splitCommission(333, 0.05).net).toBe(333);
  });
});

describe('working days', () => {
  it('skips weekends and holidays', () => {
    const fri = new Date('2026-10-16T09:00:00Z');
    expect(isWorkingDay(new Date('2026-10-17T09:00:00Z'), [])).toBe(false);
    expect(addWorkingDays(fri, 1).toISOString().slice(0, 10)).toBe('2026-10-19');
    expect(addWorkingDays(fri, 1, ['2026-10-19']).toISOString().slice(0, 10)).toBe('2026-10-20');
  });
});

describe('privacy helpers', () => {
  it('masks a Fayda number', () => {
    expect(maskIdentifier('6302123456789718')).toBe('6302 XXXX XXXX 9718');
  });
  it('round-trips field encryption', () => {
    expect(decryptField(encryptField('1000123456789'))).toBe('1000123456789');
  });
  it('masks phone numbers and handles in messages', () => {
    const r = maskContacts('Call 0911 22 33 44 or +251922334455, or t.me/myshop');
    expect(r.masked).toBe(true);
    expect(r.text).not.toMatch(/0911|922334455|t\.me\/myshop/);
  });
  it('normalises Ethiopian phone numbers', () => {
    expect(normalisePhone('0911223344')).toBe('+251911223344');
    expect(normalisePhone('+251 711 223 344')).toBe('+251711223344');
  });
});

describe('audit hashing', () => {
  it('is independent of key order', () => {
    expect(canonical({ b: 1, a: { d: 2, c: [1, { f: 1, e: 2 }] } })).toBe(canonical({ a: { c: [1, { e: 2, f: 1 }], d: 2 }, b: 1 }));
  });
});
