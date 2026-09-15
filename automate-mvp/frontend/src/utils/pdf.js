import jsPDF from 'jspdf';
import { TIMETABLES } from '../data/timetable.js';

const BRAND_BLUE = [79, 140, 255];
const BRAND_PURPLE = [160, 92, 255];
const TEXT_DARK = [22, 28, 56];
const TEXT_MUTED = [110, 122, 156];

function naira(n) {
  return 'NGN ' + Number(n).toLocaleString('en-NG');
}

function fmtCategory(c) {
  return c === 'IT' ? 'IT Student' : 'General Student';
}

function drawHeader(doc, title) {
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 0, 210, 26, 'F');
  doc.setFillColor(...BRAND_PURPLE);
  doc.rect(0, 26, 210, 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('AUTOMATE', 14, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('HUB SOLUTION', 14, 20);

  doc.setFontSize(10);
  doc.text(title, 196, 16, { align: 'right' });

  doc.setTextColor(...TEXT_DARK);
}

function drawFooter(doc) {
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220, 226, 240);
  doc.line(14, pageHeight - 18, 196, pageHeight - 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('AUTOMATE Hub Solution · automate · innovate · elevate', 14, pageHeight - 10);
  doc.text(`Generated ${new Date().toLocaleString()}`, 196, pageHeight - 10, { align: 'right' });
}

export function downloadReceipt(student) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawHeader(doc, 'OFFICIAL RECEIPT');

  let y = 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...TEXT_DARK);
  doc.text('Payment Receipt', 14, y);

  y += 10;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text('Thank you for your registration with AUTOMATE Hub Solution. Please retain this receipt for your records.', 14, y, { maxWidth: 182 });

  y += 14;
  doc.setDrawColor(...BRAND_PURPLE);
  doc.setLineWidth(0.6);
  doc.line(14, y, 196, y);

  y += 10;
  const fields = [
    ['Reference ID', student.regNo],
    ['Full Name', student.fullName],
    ['Email', student.email],
    ['Phone', student.phone],
    ['Category', fmtCategory(student.category)],
    ['Department', student.departmentName],
    ['Amount Paid', naira(student.amount)],
    ['Status', 'PAID'],
  ];

  doc.setFontSize(11);
  for (const [label, value] of fields) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXT_DARK);
    doc.text(label, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), 70, y);
    y += 8;
  }

  y += 6;
  doc.setFillColor(245, 247, 255);
  doc.roundedRect(14, y, 182, 28, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_PURPLE);
  doc.setFontSize(12);
  doc.text('Next Steps', 18, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_DARK);
  doc.setFontSize(10);
  doc.text([
    '1. Keep this receipt for verification on the first day of class.',
    '2. Download the class timetable (separate PDF) for your schedule.',
    '3. Join your department group using the link shared in your welcome email.',
  ], 18, y + 14, { maxWidth: 174 });

  drawFooter(doc);
  doc.save(`receipt-${student.regNo}.pdf`);
}

export function downloadTimetable(student) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const tt = TIMETABLES[student.departmentSlug] || {
    title: `${student.departmentName} — Timetable`,
    schedule: [],
  };

  drawHeader(doc, 'CLASS TIMETABLE');

  let y = 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...TEXT_DARK);
  doc.text(tt.title, 14, y);

  y += 10;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Issued to ${student.fullName} · ${fmtCategory(student.category)} · Ref ${student.regNo}`, 14, y, { maxWidth: 182 });

  y += 10;
  doc.setDrawColor(...BRAND_BLUE);
  doc.setLineWidth(0.6);
  doc.line(14, y, 196, y);
  y += 8;

  doc.setFillColor(...BRAND_BLUE);
  doc.rect(14, y, 182, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DAY', 18, y + 7);
  doc.text('TIME', 60, y + 7);
  doc.text('TOPIC', 100, y + 7);

  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_DARK);
  let alt = false;
  for (const row of tt.schedule) {
    if (alt) {
      doc.setFillColor(245, 247, 255);
      doc.rect(14, y, 182, 10, 'F');
    }
    alt = !alt;
    doc.text(row.day, 18, y + 7);
    doc.text(row.time, 60, y + 7);
    doc.text(row.topic, 100, y + 7, { maxWidth: 96 });
    y += 10;
  }

  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont('helvetica', 'italic');
  doc.text('Schedule is subject to change — any updates will be sent to your registered email.', 14, y, { maxWidth: 182 });

  drawFooter(doc);
  doc.save(`timetable-${student.departmentSlug}-${student.regNo}.pdf`);
}
