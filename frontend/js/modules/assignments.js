// Assignments Module - Handles assignments and submissions

import { showToast } from './toast.js';

// Mock data
const mockAssignments = [
  { id: 'as1', title: 'Short Film Project', dueDate: '2025-03-20', instructions: 'Create a 2-minute short film', status: 'active' },
  { id: 'as2', title: 'Color Grading Exercise', dueDate: '2025-03-25', instructions: 'Color grade the provided footage', status: 'active' }
];

const mockSubmissions = [
  { id: 'sub1', assignmentId: 'as1', studentName: 'John Doe', fileName: 'short_film.mp4', submittedAt: '2025-03-18', status: 'pending', grade: null }
];

// Fetch all assignments
export async function getAssignments() {
  try {
    // Mock API call
    return mockAssignments;
  } catch (error) {
    console.error('Get assignments error:', error);
    return [];
  }
}

// Create new assignment (instructor only)
export async function createAssignment(title, instructions, dueDate, sampleFile = null) {
  if (!title || !dueDate) {
    showToast('Title and due date are required', 'error');
    return false;
  }
  
  try {
    showToast('Assignment created successfully!', 'success');
    return true;
  } catch (error) {
    console.error('Create assignment error:', error);
    showToast('Failed to create assignment', 'error');
    return false;
  }
}

// Submit assignment (student only)
export async function submitAssignment(assignmentId, file) {
  if (!file) {
    showToast('Please select a file', 'error');
    return false;
  }
  
  try {
    showToast('Assignment submitted successfully!', 'success');
    return true;
  } catch (error) {
    console.error('Submit assignment error:', error);
    showToast('Failed to submit assignment', 'error');
    return false;
  }
}

// Grade submission (instructor only)
export async function gradeSubmission(submissionId, grade, feedback) {
  if (!grade || grade < 0 || grade > 100) {
    showToast('Grade must be between 0 and 100', 'error');
    return false;
  }
  
  try {
    showToast(`Grade ${grade}% submitted`, 'success');
    return true;
  } catch (error) {
    console.error('Grade submission error:', error);
    showToast('Failed to grade submission', 'error');
    return false;
  }
}

// Render assignments table
export function renderAssignmentsTable(containerId, assignments) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  if (!assignments || assignments.length === 0) {
    container.innerHTML = '<tr><td colspan="4" style="text-align:center;">No assignments found</td></tr>';
    return;
  }
  
  container.innerHTML = assignments.map(a => `
    <tr>
      <td><strong>${a.title}</strong></td>
      <td>${a.instructions || '-'}</td>
      <td>${a.dueDate || '-'}</td>
      <td><span class="badge active">Active</span></td>
    </tr>
  `).join('');
}

// Render submissions table
export function renderSubmissionsTable(containerId, submissions) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  if (!submissions || submissions.length === 0) {
    container.innerHTML = '<tr><td colspan="5" style="text-align:center;">No submissions found</td></tr>';
    return;
  }
  
  container.innerHTML = submissions.map(s => `
    <tr>
      <td>${s.studentName}</td>
      <td>${s.fileName}</td>
      <td>${s.submittedAt}</td>
      <td><span class="badge ${s.status === 'pending' ? 'pending' : 'active'}">${s.status}</span></td>
      <td>${s.grade ? s.grade + '%' : '-'}</td>
    </tr>
  `).join('');
}