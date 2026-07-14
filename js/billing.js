// ============================================================
// admin/js/billing.js — Cart-based POS billing
// ============================================================
import { LS } from '../shared/constants.js';
import {
  db, auth, doc, getDoc, updateDoc, addDoc, collection, query, where, getDocs
} from '../shared/firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ── State ────────────────────────────────────────────────────
let cbUser = null;
let cbCart = [];
let cbMenu = [];
let cbPay  = 'cash';
let cbAppliedOffers = [];
let cbLastBill = null;
let cbItemIdSeq = 0;

// ── QR Scanner State (declare at top!) ───────────────────────
let _qrStream    = null;
let _qrAnimFrame = null;

// ── Customer lookup ──────────────────────────────────────────
window.cbLookup = async function() {
  const mob = document.getElementById('cb-mob').value.trim();
  if (mob.length !== 10) { cbToast('10-digit mobile dalein'); return; }
  let found = null;
  try {
    const snap = await getDoc(doc(db, 'users', mob));
    if (snap.exists()) found = { mobile: mob, ...snap.data() };
  } catch (e) { console.warn('Firestore lookup failed', e); }
  if (!found) {
    const users = JSON.parse(localStorage.getItem(LS.users) || '[]');
    found = users.find(u => u.mobile === mob);
  }
  cbUser = found;
  const foundEl = document.getElementById('cb-cust-found');
  if (!cbUser) {
    foundEl.classList.remove('show');
    cbToast('Customer nahi mila. Pehle register karwao.');
    return;
  }
  document.getElementById('cb-cust-name').textContent = cbUser.name;
  document.getElementById('cb-cust-sub').textContent =
    `${cbUser.visits || 0} visits · ${cbUser.points || 0} pts`;
  const udhaarEl = document.getElementById('cb-udhaar-alert');
  const debt = parseFloat(cbUser.totalDebt) || 0;
  if (debt > 0) {
    udhaarEl.style.display = 'block';
    udhaarEl.textContent = `🚨 Inka ₹${debt} udhaar baki hai!`;
  } else {
    udhaarEl.style.display = 'none';
  }
  foundEl.classList.add('show');
  await cbLoadOffers();
};

// ── Load Menu ─────────────────────────────────────────────────
async function cbLoadMenu() {
  try {
    await new Promise(resolve => {
      const unsub = onAuthStateChanged(auth, user => {
        unsub();
        resolve(user);
      });
    });
    const snap = await getDocs(collection(db, 'menu'));
    cbMenu = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('Menu fetch failed', e);
    cbMenu = JSON.parse(localStorage.getItem(LS.menu) || '[]');
  }
  cbRenderItemResults(cbMenu);
}

// ── Item search/filter ────────────────────────────────────────
window.cbFilterItems = function() {
  const q = document.getElementById('cb-item-search').value.trim().toLowerCase();
  const filtered = q ? cbMenu.filter(i => (i.name || '').toLowerCase().includes(q)) : cbMenu;
  cbRenderItemResults(filtered);
};

function cbRenderItemResults(items) {
  const wrap = document.getElementById('cb-item-results');
  if (!items.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:20px;color:var(--txt3);font-size:13px">Koi item nahi mila</div>';
    return;
  }
  wrap.innerHTML = items.map(it => {
    const isOut = it.available === false;
    const hasDisc = (parseFloat(it.discount) || 0) > 0;
    const price = parseFloat(it.price) || 0;
    const finalPrice = hasDisc ? Math.round(price * (1 - parseFloat(it.discount) / 100)) : price;
    const hasVariants = it.variants && it.variants.length > 0;
    let priceHtml = hasVariants ? 'Variants' : hasDisc
      ? `<span style="text-decoration:line-through;color:var(--txt3);font-size:11px;margin-right:4px">₹${price}</span>₹${finalPrice}`
      : `₹${price}`;
    const clickAttr = isOut ? '' : `onclick="cbItemClicked('${it.id}')"`;
    return `<div class="item-row ${isOut ? 'out' : ''}" ${clickAttr}>
      <div>
        <div class="ir-name">${it.emoji || '🌯'} ${it.name}${it.isBestSeller ? ' ⭐' : ''}</div>
        <div class="ir-sub">${isOut ? 'Out of stock' : (it.category || '')}</div>
      </div>
      <div class="ir-price">${priceHtml}</div>
    </div>`;
  }).join('');
}

// ── Item clicked ──────────────────────────────────────────────
window.cbItemClicked = function(itemId) {
  const item = cbMenu.find(i => i.id === itemId);
  if (!item) return;
  if (item.variants && item.variants.length > 0) {
    const names = item.variants.map((v, i) => `${i+1}. ${v.name} — ₹${v.price}`).join('\n');
    const choice = prompt(`"${item.name}" — variant chuno:\n${names}\n\nNumber likho:`, '1');
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || !item.variants[idx]) return;
    cbAddToCart(item.name, item.variants[idx].price, item.variants[idx].name, 0);
  } else {
    const hasDisc = (parseFloat(item.discount) || 0) > 0;
    const price = parseFloat(item.price) || 0;
    const finalPrice = hasDisc ? Math.round(price * (1 - parseFloat(item.discount) / 100)) : price;
    cbAddToCart(item.name, finalPrice, null, 0);
  }
};

// ── Cart ─────────────────────────────────────────────────────
function cbAddToCart(name, price, variantName, discPct) {
  const existing = cbCart.find(c => c.name === name && c.variantName === variantName && !c.isCustom);
  if (existing) { existing.qty += 1; }
  else { cbCart.push({ id: 'c'+(cbItemIdSeq++), name, price, qty:1, variantName: variantName||null, isCustom:false }); }
  cbRenderCart();
}

window.cbQtyChange = function(cartId, delta) {
  const row = cbCart.find(c => c.id === cartId);
  if (!row) return;
  row.qty += delta;
  if (row.qty <= 0) cbCart = cbCart.filter(c => c.id !== cartId);
  cbRenderCart();
};

window.cbRemoveItem = function(cartId) {
  cbCart = cbCart.filter(c => c.id !== cartId);
  cbRenderCart();
};

function cbRenderCart() {
  const listEl  = document.getElementById('cb-cart-list');
  const emptyEl = document.getElementById('cb-empty-cart');
  const countEl = document.getElementById('cb-cart-count');
  const sumSec  = document.getElementById('cb-summary-section');
  const totalQty = cbCart.reduce((s,c) => s+c.qty, 0);
  countEl.textContent = totalQty ? `(${totalQty} items)` : '';
  if (!cbCart.length) {
    listEl.innerHTML = '';
    listEl.appendChild(emptyEl);
    emptyEl.style.display = 'block';
    sumSec.style.display = 'none';
    return;
  }
  listEl.innerHTML = cbCart.map(c => `
    <div class="cart-row">
      <div>
        <div class="cr-name">${c.name}${c.isCustom ? ' <span style="font-size:10px;color:var(--txt3)">(custom)</span>' : ''}</div>
        ${c.variantName ? `<div class="cr-variant">${c.variantName}</div>` : ''}
      </div>
      <div class="qty-ctrl">
        <button class="qty-btn" onclick="cbQtyChange('${c.id}',-1)">−</button>
        <span class="qty-val">${c.qty}</span>
        <button class="qty-btn" onclick="cbQtyChange('${c.id}',1)">+</button>
      </div>
      <div class="cr-price">₹${c.price*c.qty}</div>
      <button class="cr-del" onclick="cbRemoveItem('${c.id}')" title="Remove">🗑️</button>
    </div>`).join('');
  sumSec.style.display = 'block';
  cbRenderSummary();
}

// ── Custom item ───────────────────────────────────────────────
window.cbOpenCustomItem = function() {
  document.getElementById('cb-ci-name').value = '';
  document.getElementById('cb-ci-price').value = '';
  document.getElementById('cb-custom-modal').classList.add('open');
};
window.cbCloseCustomItem = function() {
  document.getElementById('cb-custom-modal').classList.remove('open');
};
window.cbAddCustomItem = function() {
  const name  = document.getElementById('cb-ci-name').value.trim();
  const price = parseFloat(document.getElementById('cb-ci-price').value) || 0;
  if (!name || price <= 0) { cbToast('Naam aur price dono dalein'); return; }
  cbCart.push({ id:'c'+(cbItemIdSeq++), name, price, qty:1, variantName:null, isCustom:true });
  cbRenderCart();
  cbCloseCustomItem();
};

// ── Offers ────────────────────────────────────────────────────
async function cbLoadOffers() {
  if (!cbUser) return;
  const mob = cbUser.mobile;
  const offersCardEl = document.getElementById('cb-offers-card');
  const listEl = document.getElementById('cb-offers-list');
  const offers = [];
  const today = new Date();
  const s = JSON.parse(localStorage.getItem(LS.settings) || '{}');
  const welcomeDisc = s.defaultWelcomeDisc || 10;
  if ((cbUser.visits || 0) === 0) {
    offers.push({ label:'Welcome Discount', pct:welcomeDisc, flat:0, code:'ROLL'+mob.slice(-4).toUpperCase(), type:'welcome', rewardId:null });
  }
  const dob = cbUser.dob ? new Date(cbUser.dob) : null;
  if (dob && dob.getDate()===today.getDate() && dob.getMonth()===today.getMonth()) {
    offers.push({ label:'🎂 Birthday Special', pct:15, flat:0, code:'BDAY'+mob.slice(-4).toUpperCase()+today.getFullYear(), type:'birthday', rewardId:null });
  }
  try {
    const snap = await getDocs(query(collection(db,'rewards'), where('active','==',true)));
    snap.forEach(d => {
      const rw = d.data();
      if (rw.targetMobile && rw.targetMobile !== mob) return;
      if (rw.singleUse && rw.usedBy && rw.usedBy.indexOf(mob)!==-1) return;
      if (rw.maxUses && (rw.usageCount||0) >= rw.maxUses) return;
      if (rw.expiryDate && new Date(rw.expiryDate) < today) return;
      const rType = rw.type || 'discount';
      const rVal  = rw.value || rw.discountPct || 0;
      let pct=0, flat=0;
      if (rType==='cashback') flat = parseFloat(rVal)||0;
      else pct = parseInt(rVal)||0;
      offers.push({ label:(rw.targetMobile?'💜 ':'🎁 ')+(rw.title||rw.label||rw.name||'Offer'), pct, flat, code:rw.code||'', type:'reward', rewardId:d.id });
    });
  } catch(e) { console.warn('rewards fetch failed',e); }
  if (!offers.length) { offersCardEl.style.display='none'; return; }
  offersCardEl.style.display = 'block';
  listEl.innerHTML = '<p style="font-size:11px;color:var(--txt3);margin-bottom:8px">Multiple offers select kar sakte ho</p>'
    + offers.map((o,i) => `<span class="offer-chip" onclick="cbSelectOffer(${i})">${o.label} ${o.pct>0?'('+o.pct+'%)':o.flat>0?'(₹'+o.flat+')':''}</span>`).join('');
  window._cbOffersCache = offers;
}

window.cbSelectOffer = function(idx) {
  const o = (window._cbOffersCache||[])[idx];
  if (!o) return;
  const chip = document.querySelectorAll('.offer-chip')[idx];
  const isOn = chip.classList.contains('on');
  if (isOn) { chip.classList.remove('on'); cbAppliedOffers = cbAppliedOffers.filter(a=>a!==o); }
  else { chip.classList.add('on'); cbAppliedOffers.push(o); }
  cbRenderSummary();
};

// ── Summary ───────────────────────────────────────────────────
function cbSubtotal() { return cbCart.reduce((s,c)=>s+(c.price*c.qty),0); }
function cbTotalDiscount(sub) {
  let d=0;
  cbAppliedOffers.forEach(o=>{ if(o.flat>0) d+=o.flat; else if(o.pct>0) d+=Math.round(sub*(o.pct/100)); });
  return Math.min(d,sub);
}
function cbRenderSummary() {
  const sub  = cbSubtotal();
  const disc = cbTotalDiscount(sub);
  const tot  = sub-disc;
  document.getElementById('cb-subtotal').textContent = '₹'+sub;
  const dr = document.getElementById('cb-disc-row');
  if (disc>0) { dr.style.display='flex'; document.getElementById('cb-disc-amt').textContent='-₹'+disc; }
  else dr.style.display='none';
  document.getElementById('cb-total').textContent = '₹'+tot;
}

window.cbSelPay = function(el,method) {
  document.querySelectorAll('.pay-btn').forEach(b=>b.classList.remove('on'));
  el.classList.add('on'); cbPay=method;
};

window.cbUpdatePaymentStatus = function() {
  const sub=cbSubtotal(), disc=cbTotalDiscount(sub), tot=sub-disc;
  const paidVal = document.getElementById('cb-amt-paid').value.trim();
  const statusEl = document.getElementById('cb-payment-status');
  if (!paidVal) { statusEl.style.display='none'; return; }
  const paid=parseFloat(paidVal)||0, due=Math.max(0,tot-paid);
  statusEl.style.display='block';
  if (due<=0) statusEl.innerHTML='<span style="color:var(--green);font-weight:700;font-size:12.5px">✅ Full Paid</span>';
  else if (paid>0) statusEl.innerHTML=`<span style="color:#92400e;font-weight:700;font-size:12.5px">⏳ Partial — ₹${due} baki</span>`;
  else statusEl.innerHTML=`<span style="color:var(--red);font-weight:700;font-size:12.5px">🚨 Pura Udhaar — ₹${due}</span>`;
};

// ── Confirm ───────────────────────────────────────────────────
window.cbConfirm = async function() {
  if (!cbUser) { cbToast('Pehle customer dhundo'); return; }
  if (!cbCart.length) { cbToast('Cart khali hai'); return; }
  const btn = document.getElementById('cb-confirm-btn');
  btn.disabled=true; btn.textContent='⏳ Saving...';
  const sub=cbSubtotal(), disc=cbTotalDiscount(sub), final=sub-disc;
  const mob=cbUser.mobile, nowIso=new Date().toISOString();
  const paidVal = document.getElementById('cb-amt-paid').value.trim();
  const amountPaid = paidVal==='' ? final : (parseFloat(paidVal)||0);
  const amountDue  = Math.max(0,final-amountPaid);
  const paymentStatus = amountDue<=0 ? 'paid' : amountPaid>0 ? 'partial' : 'pending';
  const s = JSON.parse(localStorage.getItem(LS.settings)||'{}');
  const goal=s.defaultVisitThreshold||5, visitBonus=s.defaultPerVisitPts||5;
  const spendPts=Math.floor((sub/10)*(s.pointsPer10Rs||0));
  const ptsAdd=visitBonus+spendPts;
  const newVisits=((cbUser.visits||0)+1), newPoints=((cbUser.points||0)+ptsAdd);
  const newSaved=((cbUser.saved||0)+disc), newDebt=Math.max(0,(parseFloat(cbUser.totalDebt)||0)+amountDue);
  let saveOk=true;
  const extra={totalDebt:newDebt};
  cbAppliedOffers.forEach(o=>{ if(o.type==='welcome') extra.couponUsed_welcome=nowIso; if(o.type==='birthday') extra.couponUsed_birthday=nowIso; });
  try { await updateDoc(doc(db,'users',mob),{visits:newVisits,points:newPoints,saved:newSaved,lastVisit:nowIso,...extra}); }
  catch(e){console.warn('customer update failed',e);saveOk=false;}
  const itemsSnap=cbCart.map(c=>({name:c.name,qty:c.qty,price:c.price,variant:c.variantName||null}));
  const offerLabel=cbAppliedOffers.length?cbAppliedOffers.map(o=>o.type==='reward'?'reward':o.type).join('+'):'none';
  let billId=null;
  try {
    const ref=await addDoc(collection(db,'bills'),{mobile:mob,name:cbUser.name,amt:sub,final,discount:disc,offer:offerLabel,offersApplied:cbAppliedOffers.map(o=>({label:o.label,type:o.type,pct:o.pct,flat:o.flat,code:o.code})),payment:cbPay,time:nowIso,visitNumber:newVisits,pointsEarned:ptsAdd,items:itemsSnap,status:paymentStatus,amountPaid,amountDue});
    billId=ref.id;
  } catch(e){console.warn('bill add failed',e);saveOk=false;}
  for(const ao of cbAppliedOffers){
    if(ao.type!=='reward'||!ao.rewardId) continue;
    const share=ao.flat>0?ao.flat:Math.round(sub*(ao.pct/100));
    if(share<=0) continue;
    try{
      const rwRef=doc(db,'rewards',ao.rewardId), rwDoc=await getDoc(rwRef);
      if(rwDoc.exists()){const rw=rwDoc.data(),usedBy=rw.usedBy||[],amounts=rw.savedAmounts||{};
        if(usedBy.indexOf(mob)===-1)usedBy.push(mob);amounts[mob]=(parseInt(amounts[mob])||0)+share;
        await updateDoc(rwRef,{usageCount:(rw.usageCount||0)+1,usedBy,savedAmount:(parseInt(rw.savedAmount)||0)+share,savedAmounts:amounts});}
    }catch(e){console.warn('reward failed',e);}
  }
  const users=JSON.parse(localStorage.getItem(LS.users)||'[]'),idx=users.findIndex(u=>u.mobile===mob);
  if(idx!==-1){users[idx].visits=newVisits;users[idx].points=newPoints;users[idx].saved=newSaved;localStorage.setItem(LS.users,JSON.stringify(users));}
  const bills=JSON.parse(localStorage.getItem(LS.bills)||'[]');
  bills.unshift({mobile:mob,name:cbUser.name,amt:sub,final,discount:disc,payment:cbPay,time:nowIso,pointsEarned:ptsAdd});
  localStorage.setItem(LS.bills,JSON.stringify(bills));
  btn.disabled=false; btn.textContent='✅ Confirm & Save Bill';
  if(!saveOk){alert('⚠️ Save nahi hua — internet check karo');return;}
  cbLastBill={name:cbUser.name,mobile:mob,amt:sub,final,disc,pay:cbPay,points:newPoints,pointsEarned:ptsAdd,visits:newVisits,billId,isMilestone:newVisits%goal===0,rewardLabel:s.defaultVisitReward||'FREE item',items:itemsSnap};
  document.querySelector('.pos-grid').style.display='none';
  document.getElementById('cart-success').style.display='block';
  document.getElementById('cs-title').textContent=cbLastBill.isMilestone?`🎉 Visit ${newVisits} — Milestone!`:'✅ Bill Saved!';
  document.getElementById('cs-sub').textContent=cbLastBill.isMilestone?`${cbUser.name} ko ${cbLastBill.rewardLabel} milega! · +${ptsAdd} pts`:`${cbUser.name} · ₹${final} · +${ptsAdd} pts`;
  document.getElementById('cs-items-list').innerHTML=itemsSnap.map(i=>`<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:var(--txt2)"><span>${i.name}${i.variant?' ('+i.variant+')':''} <span style="color:var(--txt3)">x${i.qty}</span></span><span style="font-weight:700;color:var(--txt)">₹${i.price*i.qty}</span></div>`).join('');
  document.getElementById('cs-subtotal').textContent='₹'+sub;
  const dre=document.getElementById('cs-disc-row');
  if(disc>0){dre.style.display='flex';document.getElementById('cs-disc-amt').textContent='-₹'+disc;}else dre.style.display='none';
  document.getElementById('cs-final').textContent='₹'+final;
  document.getElementById('cs-payment').textContent={cash:'💵 Cash',upi:'📲 UPI',card:'💳 Card'}[cbPay]||cbPay;
  document.getElementById('cs-points').textContent='+'+ptsAdd;
  const dueRow=document.getElementById('cs-due-row');
  if(amountDue>0){dueRow.style.display='flex';document.getElementById('cs-due-amt').textContent='₹'+amountDue;}else dueRow.style.display='none';
};

window.cbWhatsAppReceipt = function() {
  if (!cbLastBill) return;
  const b  = cbLastBill;
  const sh = JSON.parse(localStorage.getItem(LS.shop) || '{}');
  const appLink = 'https://sharmagarments.vishtechfixes.com';
  const lines = b.items.map(i =>
    `${i.name}${i.variant?' ('+i.variant+')':''} x${i.qty} = ₹${i.price*i.qty}`
  ).join('\n');
  const msg = encodeURIComponent(
    `🧾 *${sh.name||'Kathi Roll Hub'} — Bill Receipt*\n` +
    `────────────────\n` +
    `👤 ${b.name}\n📱 ${b.mobile}\n` +
    `────────────────\n` +
    `${lines}\n` +
    `────────────────\n` +
    `💰 Subtotal: ₹${b.amt}\n` +
    `${b.disc>0 ? '🎁 Discount: -₹'+b.disc+'\n' : ''}` +
    `✅ *Final: ₹${b.final}*\n` +
    `💳 ${b.pay.toUpperCase()}\n` +
    `────────────────\n` +
    `⭐ Points Earned: +${b.pointsEarned}\n` +
    `⭐ Total Points: ${b.points}\n` +
    `Dhanyawaad! Dobara aana 🙏\n` +
    `📱 App link save karo: ${appLink}`
  );
  window.open(`https://wa.me/${b.mobile}?text=${msg}`, '_blank');
};

window.cbPrintReceipt=function(){
  if(!cbLastBill)return;
  const b=cbLastBill,sh=JSON.parse(localStorage.getItem(LS.shop)||'{}');
  const rows=b.items.map(i=>`<div class="row"><span>${i.name}${i.variant?' ('+i.variant+')':''} x${i.qty}</span><span>₹${i.price*i.qty}</span></div>`).join('');
  const html=`<html><head><title>Receipt</title><style>body{font-family:monospace;width:280px;margin:0 auto;padding:16px;font-size:13px}.c{text-align:center}.b{font-weight:700}hr{border:none;border-top:1px dashed #000;margin:8px 0}.row{display:flex;justify-content:space-between}</style></head><body><div class="c b" style="font-size:15px">${sh.name||'Kathi Roll Hub'}</div><div class="c">${sh.loc||''}</div><hr/><div class="row"><span>Customer</span><span class="b">${b.name}</span></div><div class="row"><span>Mobile</span><span>${b.mobile}</span></div><div class="row"><span>Date</span><span>${new Date().toLocaleString('en-IN')}</span></div><hr/>${rows}<hr/><div class="row"><span>Subtotal</span><span>₹${b.amt}</span></div>${b.disc>0?'<div class="row"><span>Discount</span><span>-₹'+b.disc+'</span></div>':''}<div class="row b" style="font-size:15px"><span>Final</span><span>₹${b.final}</span></div><div class="row"><span>Payment</span><span>${b.pay.toUpperCase()}</span></div><hr/><div class="row"><span>Points Earned</span><span>+${b.pointsEarned}</span></div><div class="row"><span>Total Points</span><span>${b.points}</span></div><hr/><div class="c">Dhanyawaad! Dobara aana 🙏</div></body></html>`;
  const w=window.open('','_blank');w.document.write(html);w.document.close();setTimeout(()=>w.print(),250);
};

window.cbNewBill=function(){
  cbUser=null;cbCart=[];cbAppliedOffers=[];cbPay='cash';cbLastBill=null;
  document.getElementById('cb-mob').value='';
  document.getElementById('cb-cust-found').classList.remove('show');
  document.getElementById('cb-udhaar-alert').style.display='none';
  document.getElementById('cb-item-search').value='';
  document.getElementById('cb-amt-paid').value='';
  document.getElementById('cb-payment-status').style.display='none';
  document.getElementById('cb-offers-card').style.display='none';
  document.querySelector('.pos-grid').style.display='grid';
  document.getElementById('cart-success').style.display='none';
  cbRenderItemResults(cbMenu);cbRenderCart();
};

function cbToast(msg,dur=2500){
  const t=document.getElementById('cb-toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),dur);
}

// ── Init ─────────────────────────────────────────────────────
cbLoadMenu();

// ══════════════════════════════════════════════════════════════
// QR SCANNER — SIRF YAHI ADD HUA HAI
// ══════════════════════════════════════════════════════════════

// jsQR load karo
const _jsqrScript = document.createElement('script');
_jsqrScript.src = 'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js';
_jsqrScript.onload  = () => console.log('[QR] jsQR ready!');
_jsqrScript.onerror = () => console.error('[QR] jsQR load failed!');
document.head.appendChild(_jsqrScript);

window.openQrScanner = function() {
  // Reset state
  _qrStream    = null;
  _qrAnimFrame = null;

  const modal  = document.getElementById('qr-scan-modal');
  const status = document.getElementById('qr-scan-status');
  if (!modal) { cbToast('QR scanner HTML missing'); return; }

  modal.classList.add('open');
  status.textContent = '📷 Camera shuru ho rahi hai...';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = '❌ Camera supported nahi hai is browser mein';
    return;
  }

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } }
  })
  .then(stream => {
    _qrStream = stream;
    const video = document.getElementById('qr-video');
    video.srcObject = stream;
    video.play();
    status.textContent = '🔍 Customer ka QR code dikhao...';
    video.addEventListener('loadeddata', () => _scanFrame(video), { once: true });
  })
  .catch(err => {
    console.error('[QR] Camera error:', err.name, err.message);
    if (err.name === 'NotAllowedError') {
      status.textContent = '❌ Camera permission deny hai — browser settings mein allow karo';
    } else if (err.name === 'NotFoundError') {
      status.textContent = '❌ Camera nahi mila device pe';
    } else {
      status.textContent = '❌ Camera error: ' + err.message;
    }
  });
};

function _scanFrame(video) {
  const canvas = document.getElementById('qr-canvas');
  const ctx    = canvas.getContext('2d');

  function tick() {
    const modal = document.getElementById('qr-scan-modal');
    if (!modal || !modal.classList.contains('open')) return;

    if (video.readyState >= 2 && video.videoWidth > 0) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (typeof jsQR !== 'undefined') {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code && code.data) {
          const raw = code.data.trim();
          console.log('[QR] Detected:', raw);

          if (raw.startsWith('KRH:')) {
            const mobile = raw.replace('KRH:', '').trim();
            if (/^\d{10}$/.test(mobile)) {
              window.closeQrScanner();
              document.getElementById('cb-mob').value = mobile;
              cbToast('✅ QR scan ho gaya!');
              setTimeout(() => window.cbLookup(), 600);
              return;
            }
          }
          document.getElementById('qr-scan-status').textContent = '⚠️ Kathi Roll Hub QR nahi — dobara try karo';
        }
      }
    }
    _qrAnimFrame = requestAnimationFrame(tick);
  }
  _qrAnimFrame = requestAnimationFrame(tick);
}

window.closeQrScanner = function() {
  if (_qrAnimFrame) { cancelAnimationFrame(_qrAnimFrame); _qrAnimFrame = null; }
  if (_qrStream)    { _qrStream.getTracks().forEach(t => t.stop()); _qrStream = null; }
  const video = document.getElementById('qr-video');
  if (video) video.srcObject = null;
  const modal = document.getElementById('qr-scan-modal');
  if (modal) modal.classList.remove('open');
};












