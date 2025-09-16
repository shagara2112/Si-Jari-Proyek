import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://hjllwagynjjhifufvpvg.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbGx3YWd5bmpqaGlmdWZ2cHZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMDM2MDcsImV4cCI6MjA3MzU3OTYwN30.IFlDZ9pWNsucKM2uwzAh4zCm31ZUMtId4LPKs1r-qU0';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const App = () => {
  // State for authentication
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupData, setSignupData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'Project Proposer',
    department: 'IT Department'
  });

  // State for application data
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [newProject, setNewProject] = useState({
    title: '',
    description: '',
    budget: '',
    timeline: '',
    department: ''
  });
  const [newComment, setNewComment] = useState('');
  const [newMilestone, setNewMilestone] = useState({ name: '', dueDate: '', description: '' });
  const [newIssue, setNewIssue] = useState({ description: '' });
  const [newUpdate, setNewUpdate] = useState('');

  // Departments and roles for dropdowns
  const departments = ['IT Department', 'Finance', 'Legal', 'Operations', 'HR', 'Marketing', 'Sales'];
  const roles = ['Project Proposer', 'Finance', 'Legal', 'Operations', 'Director', 'Administrator'];

  // Initialize - check for existing session
  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
        setLoading(false);
      } catch (error) {
        console.error('Error checking session:', error);
        setLoading(false);
      }
    };
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Fetch projects when user changes
  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user]);

  // Fetch projects based on user role
  const fetchProjects = async () => {
    try {
      if (!user) return;
      
      // Get user profile to determine role
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching user profile:', profileError);
        return;
      }

      // If user profile doesn't exist, create one
      if (!userProfile) {
        const { error: createError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: user.id,
            name: user.email.split('@')[0],
            email: user.email,
            role: 'Project Proposer',
            department: 'IT Department'
          });
          
        if (createError) {
          console.error('Error creating user profile:', createError);
          return;
        }
      }

      let query = supabase
        .from('projects')
        .select(`
          *,
          user_profiles!projects_submitter_id_fkey (name, role, department),
          reviewers (*),
          risk_analysis (*),
          milestones (*),
          issues (*),
          updates (*),
          discussions (*)
        `)
        .order('created_at', { ascending: false });

      // Filter based on user role
      if (userProfile?.role === 'Project Proposer') {
        query = query.eq('submitter_id', user.id);
      } else if (userProfile?.role !== 'Director' && userProfile?.role !== 'Administrator') {
        // Reviewers can see projects where they are assigned as reviewers
        const { data: reviewerProjects, error: reviewerError } = await supabase
          .from('reviewers')
          .select('project_id')
          .eq('reviewer_id', user.id);
          
        if (reviewerError) {
          console.error('Error fetching reviewer projects:', reviewerError);
          return;
        }
        
        const projectIds = reviewerProjects.map(r => r.project_id);
        if (projectIds.length > 0) {
          query = query.in('id', projectIds);
        } else {
          // Return empty array if no projects assigned
          setProjects([]);
          return;
        }
      }
      // Directors and Administrators can see all projects

      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching projects:', error);
        return;
      }
      
      // Process and format the data
      const formattedProjects = (data || []).map(project => ({
        ...project,
        submitter: project.user_profiles?.name || 'Unknown',
        submitterRole: project.user_profiles?.role || 'Project Proposer',
        submitterDepartment: project.user_profiles?.department || 'IT Department',
        reviewers: project.reviewers || [],
        riskAnalysis: {
          financial: (project.risk_analysis || []).find(r => r.category === 'financial') || { risk: 'Not assessed', mitigation: '' },
          legal: (project.risk_analysis || []).find(r => r.category === 'legal') || { risk: 'Not assessed', mitigation: '' },
          technical: (project.risk_analysis || []).find(r => r.category === 'technical') || { risk: 'Not assessed', mitigation: '' },
          operational: (project.risk_analysis || []).find(r => r.category === 'operational') || { risk: 'Not assessed', mitigation: '' }
        },
        actualWork: {
          startDate: project.start_date || '',
          endDate: project.end_date || '',
          progress: project.progress || 0,
          milestones: project.milestones || [],
          budgetSpent: project.budget_spent || 0,
          issues: project.issues || [],
          updates: project.updates || []
        },
        discussions: project.discussions || []
      }));
      
      setProjects(formattedProjects);
    } catch (error) {
      console.error('Error in fetchProjects:', error);
    }
  };

  // Handle login
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      
      if (error) throw error;
      
      setUser(data.user);
    } catch (error) {
      alert('Login failed: ' + error.message);
    }
  };

  // Handle signup
  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupData.email,
        password: signupData.password,
      });
      
      if (error) throw error;
      
      // Create user profile
      if (data.user) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: data.user.id,
            name: signupData.name,
            email: signupData.email,
            role: signupData.role,
            department: signupData.department
          });
          
        if (profileError) throw profileError;
        
        alert('Account created successfully! Please check your email for confirmation.');
      }
    } catch (error) {
      alert('Signup failed: ' + error.message);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setActiveTab('dashboard');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Submit new project
  const handleProjectSubmission = async (e) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      // Insert project
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .insert({
          title: newProject.title,
          description: newProject.description,
          budget: parseFloat(newProject.budget),
          timeline: newProject.timeline,
          department: newProject.department,
          submitter_id: user.id,
          status: 'pending_review',
          progress: 0
        })
        .select()
        .single();
        
      if (projectError) throw projectError;
      
      // Add default reviewers (in a real app, you might want to make this configurable)
      // Get reviewer user IDs for each department
      const reviewerRoles = [
        { department: 'Finance', role: 'Finance' },
        { department: 'Legal', role: 'Legal' },
        { department: 'Operations', role: 'Operations' }
      ];
      
      for (let reviewerRole of reviewerRoles) {
        const { data: reviewerData, error: reviewerError } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('role', reviewerRole.role)
          .eq('department', reviewerRole.department)
          .limit(1)
          .single();
          
        if (!reviewerError && reviewerData) {
          await supabase
            .from('reviewers')
            .insert({
              project_id: projectData.id,
              reviewer_id: reviewerData.user_id,
              department: reviewerRole.department,
              status: 'pending',
              comment: ''
            });
        }
      }
      
      // Initialize risk analysis
      const riskCategories = ['financial', 'legal', 'technical', 'operational'];
      for (let category of riskCategories) {
        await supabase
          .from('risk_analysis')
          .insert({
            project_id: projectData.id,
            category: category,
            risk: 'Not assessed',
            mitigation: ''
          });
      }
      
      // Reset form and refresh projects
      setNewProject({ title: '', description: '', budget: '', timeline: '', department: '' });
      await fetchProjects();
      setActiveTab('dashboard');
      
      alert('Project submitted successfully!');
    } catch (error) {
      console.error('Error submitting project:', error);
      alert('Failed to submit project: ' + error.message);
    }
  };

  // Handle review action
  const handleReviewAction = async (projectId, action, comment = '') => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('reviewers')
        .update({
          status: action,
          comment: comment,
          updated_at: new Date().toISOString()
        })
        .eq('project_id', projectId)
        .eq('reviewer_id', user.id);
        
      if (error) throw error;
      
      // Check if all reviewers have responded
      const { data: allReviewers, error: reviewersError } = await supabase
        .from('reviewers')
        .select('status')
        .eq('project_id', projectId);
        
      if (reviewersError) throw reviewersError;
      
      const allReviewed = allReviewers.every(r => r.status !== 'pending');
      const hasRejection = allReviewers.some(r => r.status === 'rejected');
      
      if (allReviewed) {
        const projectStatus = hasRejection ? 'rejected' : 'pending_director';
        await supabase
          .from('projects')
          .update({ status: projectStatus })
          .eq('id', projectId);
      }
      
      await fetchProjects();
    } catch (error) {
      console.error('Error updating review:', error);
      alert('Failed to update review: ' + error.message);
    }
  };

  // Handle director action
  const handleDirectorAction = async (projectId, action, comment = '') => {
    if (!user) return;
    
    try {
      // Get user profile to verify role
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();
        
      if (profileError) throw profileError;
      
      if (userProfile.role !== 'Director') {
        throw new Error('Only directors can approve or reject projects');
      }
      
      const { error } = await supabase
        .from('projects')
        .update({
          status: action,
          director_comment: comment,
          director_id: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId);
        
      if (error) throw error;
      
      await fetchProjects();
    } catch (error) {
      console.error('Error updating director decision:', error);
      alert('Failed to update director decision: ' + error.message);
    }
  };

  // Add comment to project
  const addComment = async (projectId) => {
    if (!newComment.trim() || !user) return;
    
    try {
      // Get user profile for name
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('user_id', user.id)
        .single();
        
      if (profileError) throw profileError;
      
      const { error } = await supabase
        .from('discussions')
        .insert({
          project_id: projectId,
          user_id: user.id,
          user_name: userProfile.name,
          comment: newComment,
          created_at: new Date().toISOString()
        });
        
      if (error) throw error;
      
      setNewComment('');
      await fetchProjects();
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Failed to add comment: ' + error.message);
    }
  };

  // Add milestone to project
  const addMilestone = async (projectId) => {
    if (!newMilestone.name || !newMilestone.dueDate || !user) return;
    
    try {
      const { error } = await supabase
        .from('milestones')
        .insert({
          project_id: projectId,
          name: newMilestone.name,
          due_date: newMilestone.dueDate,
          description: newMilestone.description,
          status: 'not_started',
          created_at: new Date().toISOString()
        });
        
      if (error) throw error;
      
      setNewMilestone({ name: '', dueDate: '', description: '' });
      await fetchProjects();
    } catch (error) {
      console.error('Error adding milestone:', error);
      alert('Failed to add milestone: ' + error.message);
    }
  };

  // Update milestone status
  const updateMilestoneStatus = async (projectId, milestoneId, status) => {
    if (!user) return;
    
    try {
      const completionDate = status === 'completed' ? new Date().toISOString() : null;
      
      const { error } = await supabase
        .from('milestones')
        .update({
          status: status,
          completion_date: completionDate,
          updated_at: new Date().toISOString()
        })
        .eq('id', milestoneId)
        .eq('project_id', projectId);
        
      if (error) throw error;
      
      // Calculate and update project progress
      const { data: allMilestones, error: milestonesError } = await supabase
        .from('milestones')
        .select('status')
        .eq('project_id', projectId);
        
      if (milestonesError) throw milestonesError;
      
      const completedCount = allMilestones.filter(m => m.status === 'completed').length;
      const progress = allMilestones.length > 0 ? Math.round((completedCount / allMilestones.length) * 100) : 0;
      
      await supabase
        .from('projects')
        .update({ progress: progress })
        .eq('id', projectId);
      
      await fetchProjects();
    } catch (error) {
      console.error('Error updating milestone:', error);
      alert('Failed to update milestone: ' + error.message);
    }
  };

  // Add issue to project
  const addIssue = async (projectId) => {
    if (!newIssue.description || !user) return;
    
    try {
      // Get user profile for name
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('user_id', user.id)
        .single();
        
      if (profileError) throw profileError;
      
      const { error } = await supabase
        .from('issues')
        .insert({
          project_id: projectId,
          description: newIssue.description,
          reported_by: userProfile.name,
          status: 'open',
          created_at: new Date().toISOString()
        });
        
      if (error) throw error;
      
      setNewIssue({ description: '' });
      await fetchProjects();
    } catch (error) {
      console.error('Error adding issue:', error);
      alert('Failed to add issue: ' + error.message);
    }
  };

  // Resolve issue
  const resolveIssue = async (projectId, issueId, resolution) => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('issues')
        .update({
          status: 'resolved',
          resolution: resolution,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', issueId)
        .eq('project_id', projectId);
        
      if (error) throw error;
      
      await fetchProjects();
    } catch (error) {
      console.error('Error resolving issue:', error);
      alert('Failed to resolve issue: ' + error.message);
    }
  };

  // Add update to project
  const addUpdate = async (projectId) => {
    if (!newUpdate.trim() || !user) return;
    
    try {
      // Get user profile for name
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('user_id', user.id)
        .single();
        
      if (profileError) throw profileError;
      
      const { error } = await supabase
        .from('updates')
        .insert({
          project_id: projectId,
          update_text: newUpdate,
          author: userProfile.name,
          created_at: new Date().toISOString()
        });
        
      if (error) throw error;
      
      setNewUpdate('');
      await fetchProjects();
    } catch (error) {
      console.error('Error adding update:', error);
      alert('Failed to add update: ' + error.message);
    }
  };

  // Start project
  const startProject = async (projectId) => {
    if (!user) return;
    
    try {
      // Verify user is the project owner or admin
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('submitter_id')
        .eq('id', projectId)
        .single();
        
      if (projectError) throw projectError;
      
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();
        
      if (profileError) throw profileError;
      
      if (project.submitter_id !== user.id && userProfile.role !== 'Administrator') {
        throw new Error('Only project owners or administrators can start projects');
      }
      
      const { error } = await supabase
        .from('projects')
        .update({
          start_date: new Date().toISOString(),
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId);
        
      if (error) throw error;
      
      await fetchProjects();
    } catch (error) {
      console.error('Error starting project:', error);
      alert('Failed to start project: ' + error.message);
    }
  };

  // Complete project
  const completeProject = async (projectId) => {
    if (!user) return;
    
    try {
      // Verify user is the project owner or admin
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('submitter_id')
        .eq('id', projectId)
        .single();
        
      if (projectError) throw projectError;
      
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();
        
      if (profileError) throw profileError;
      
      if (project.submitter_id !== user.id && userProfile.role !== 'Administrator') {
        throw new Error('Only project owners or administrators can complete projects');
      }
      
      const { error } = await supabase
        .from('projects')
        .update({
          end_date: new Date().toISOString(),
          status: 'completed',
          progress: 100,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId);
        
      if (error) throw error;
      
      await fetchProjects();
    } catch (error) {
      console.error('Error completing project:', error);
      alert('Failed to complete project: ' + error.message);
    }
  };

  // Get status color based on status
  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'pending_review': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'not_started': return 'bg-gray-100 text-gray-800';
      case 'delayed': return 'bg-orange-100 text-orange-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'open': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get project status
  const getProjectStatus = (project) => {
    return project.status;
  };

  // Check if user can review a project
  const canReviewProject = (project) => {
    if (!user) return false;
    
    const reviewer = project.reviewers?.find(r => r.reviewer_id === user.id);
    return reviewer && reviewer.status === 'pending';
  };

  // Check if user can manage a project
  const canManageProject = (project) => {
    if (!user) return false;
    return user.id === project.submitter_id;
  };

  // Workflow Visualization Component
  const WorkflowVisualization = ({ project }) => {
    // Get reviewer names from user_profiles
    const reviewersStatus = project.reviewers?.map(reviewer => ({
      name: reviewer.name || reviewer.department,
      department: reviewer.department,
      status: reviewer.status
    })) || [];
    
    const projectStatus = getProjectStatus(project);
    
    return (
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4">Workflow Status</h3>
        <div className="flex flex-col md:flex-row items-center justify-center space-y-4 md:space-y-0 md:space-x-4">
          {/* Submitter */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
              {project.submitter?.split(' ').map(n => n[0]).join('') || 'S'}
            </div>
            <p className="mt-2 text-sm font-medium">{project.submitter || 'Submitter'}</p>
            <p className="text-xs text-gray-500">Submitted</p>
          </div>
          
          {/* Arrow */}
          <div className="hidden md:block">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </div>
          
          {/* Reviewers */}
          <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-4">
            {reviewersStatus.map((reviewer, index) => (
              <div key={index} className="flex flex-col items-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-white ${
                  reviewer.status === 'approved' ? 'bg-green-500' : 
                  reviewer.status === 'rejected' ? 'bg-red-500' : 
                  reviewer.status === 'pending' ? 'bg-yellow-500' : 'bg-gray-500'
                }`}>
                  {reviewer.name.split(' ').map(n => n[0]).join('')}
                </div>
                <p className="mt-2 text-sm font-medium">{reviewer.name}</p>
                <p className="text-xs text-gray-500">{reviewer.department}</p>
                <span className={`px-2 py-1 rounded-full text-xs mt-1 ${getStatusColor(reviewer.status)}`}>
                  {reviewer.status}
                </span>
              </div>
            ))}
          </div>
          
          {/* Arrow to Director */}
          <div className="hidden md:block">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </div>
          
          {/* Director */}
          <div className="flex flex-col items-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-white ${
              project.status === 'approved' ? 'bg-green-500' : 
              project.status === 'rejected' ? 'bg-red-500' : 
              project.status === 'pending_director' ? 'bg-yellow-500' : 'bg-gray-400'
            }`}>
              DIR
            </div>
            <p className="mt-2 text-sm font-medium">Director</p>
            <span className={`px-2 py-1 rounded-full text-xs mt-1 ${getStatusColor(project.status)}`}>
              {project.status.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Risk Analysis Section
  const RiskAnalysisSection = ({ project, isEditable = false }) => {
    const [riskData, setRiskData] = useState(project.riskAnalysis || {});
    const [editing, setEditing] = useState(false);
    
    const handleRiskUpdate = (category, field, value) => {
      setRiskData({
        ...riskData,
        [category]: {
          ...riskData[category],
          [field]: value
        }
      });
    };
    
    const saveRiskAnalysis = async () => {
      if (!user) return;
      
      try {
        // Update each risk category
        for (const category of ['financial', 'legal', 'technical', 'operational']) {
          const riskItem = riskData[category];
          if (riskItem) {
            const { error } = await supabase
              .from('risk_analysis')
              .update({
                risk: riskItem.risk,
                mitigation: riskItem.mitigation,
                updated_at: new Date().toISOString()
              })
              .eq('project_id', project.id)
              .eq('category', category);
              
            if (error) throw error;
          }
        }
        
        setEditing(false);
        await fetchProjects();
      } catch (error) {
        console.error('Error saving risk analysis:', error);
        alert('Failed to save risk analysis: ' + error.message);
      }
    };
    
    const riskCategories = [
      { key: 'financial', label: 'Financial Risk', icon: '💰' },
      { key: 'legal', label: 'Legal Risk', icon: '⚖️' },
      { key: 'technical', label: 'Technical Risk', icon: '💻' },
      { key: 'operational', label: 'Operational Risk', icon: '⚙️' }
    ];
    
    return (
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Risk Analysis</h3>
          {isEditable && !editing && (
            <button 
              onClick={() => setEditing(true)}
              className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition"
            >
              Edit Risk Analysis
            </button>
          )}
          {editing && (
            <button 
              onClick={saveRiskAnalysis}
              className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600 transition"
            >
              Save Changes
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {riskCategories.map(category => (
            <div key={category.key} className="border rounded-lg p-4">
              <div className="flex items-center mb-3">
                <span className="text-xl mr-2">{category.icon}</span>
                <h4 className="font-medium">{category.label}</h4>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
                  {editing ? (
                    <select 
                      value={riskData[category.key]?.risk || 'Not assessed'}
                      onChange={(e) => handleRiskUpdate(category.key, 'risk', e.target.value)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Not assessed">Not assessed</option>
                    </select>
                  ) : (
                    <div className={`px-3 py-1 rounded-full text-sm inline-block ${
                      riskData[category.key]?.risk === 'High' ? 'bg-red-100 text-red-800' :
                      riskData[category.key]?.risk === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                      riskData[category.key]?.risk === 'Low' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {riskData[category.key]?.risk || 'Not assessed'}
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mitigation Strategy</label>
                  {editing ? (
                    <textarea 
                      value={riskData[category.key]?.mitigation || ''}
                      onChange={(e) => handleRiskUpdate(category.key, 'mitigation', e.target.value)}
                      className="w-full p-2 border rounded"
                      rows="3"
                    />
                  ) : (
                    <p className="text-gray-700">{riskData[category.key]?.mitigation || 'No mitigation strategy defined'}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Actual Work Tracking Component
  const ActualWorkTracking = ({ project }) => {
    const isProjectApproved = getProjectStatus(project) === 'approved';
    const actualWork = project.actualWork || {};
    const canManage = canManageProject(project);
    
    return (
      <div className="mt-6 bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold">Actual Work Tracking</h3>
          {isProjectApproved && !actualWork.startDate && canManage && (
            <button 
              onClick={() => startProject(project.id)}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
            >
              Start Project
            </button>
          )}
          {isProjectApproved && actualWork.startDate && !actualWork.endDate && actualWork.progress === 100 && canManage && (
            <button 
              onClick={() => completeProject(project.id)}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition"
            >
              Complete Project
            </button>
          )}
        </div>
        
        {/* Project Timeline and Progress */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-medium">Project Progress</h4>
            <span className="text-lg font-bold">{actualWork.progress || 0}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${actualWork.progress || 0}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-sm text-gray-500 mt-2">
            <span>Start Date: {actualWork.startDate ? new Date(actualWork.startDate).toLocaleDateString() : 'Not started'}</span>
            <span>End Date: {actualWork.endDate ? new Date(actualWork.endDate).toLocaleDateString() : 'In progress'}</span>
          </div>
        </div>
        
        {/* Budget Tracking */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-3">Budget Tracking</h4>
          <div className="flex justify-between items-center mb-2">
            <span>Approved Budget: ${(project.budget || 0).toLocaleString()}</span>
            <span>Spent: ${(actualWork.budgetSpent || 0).toLocaleString()}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                (actualWork.budgetSpent / project.budget) * 100 > 90 ? 'bg-red-500' : 
                (actualWork.budgetSpent / project.budget) * 100 > 75 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(((actualWork.budgetSpent || 0) / (project.budget || 1)) * 100, 100)}%` }}
            ></div>
          </div>
          <div className="text-sm">
            <span className="font-medium">
              {actualWork.budgetSpent > project.budget ? 'Over budget by ' : 'Remaining budget: '}
              {Math.abs((actualWork.budgetSpent || 0) - (project.budget || 0)).toLocaleString()} USD
            </span>
          </div>
        </div>
        
        {/* Milestones */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-medium">Milestones</h4>
            {isProjectApproved && actualWork.startDate && canManage && (
              <button 
                onClick={() => document.getElementById('add-milestone-modal').classList.remove('hidden')}
                className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition"
              >
                Add Milestone
              </button>
            )}
          </div>
          
          <div className="space-y-3">
            {(actualWork.milestones || []).map(milestone => (
              <div key={milestone.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h5 className="font-medium">{milestone.name}</h5>
                  <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(milestone.status)}`}>
                    {milestone.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{milestone.description}</p>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Due: {milestone.due_date ? new Date(milestone.due_date).toLocaleDateString() : 'Not set'}</span>
                  {milestone.completion_date && <span>Completed: {new Date(milestone.completion_date).toLocaleDateString()}</span>}
                </div>
                {isProjectApproved && actualWork.startDate && canManage && milestone.status !== 'completed' && (
                  <div className="mt-3 flex space-x-2">
                    <button 
                      onClick={() => updateMilestoneStatus(project.id, milestone.id, 'in_progress')}
                      className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition"
                    >
                      Mark In Progress
                    </button>
                    <button 
                      onClick={() => updateMilestoneStatus(project.id, milestone.id, 'completed')}
                      className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 transition"
                    >
                      Mark Completed
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Issues */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-medium">Issues & Risks</h4>
            {isProjectApproved && actualWork.startDate && (
              <button 
                onClick={() => document.getElementById('add-issue-modal').classList.remove('hidden')}
                className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 transition"
              >
                Report Issue
              </button>
            )}
          </div>
          
          <div className="space-y-3">
            {(actualWork.issues || []).map(issue => (
              <div key={issue.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h5 className="font-medium">Issue #{issue.id}</h5>
                  <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(issue.status)}`}>
                    {issue.status}
                  </span>
                </div>
                <p className="mb-2">{issue.description}</p>
                <div className="text-sm text-gray-500 mb-2">
                  Reported by {issue.reported_by} on {issue.created_at ? new Date(issue.created_at).toLocaleDateString() : 'Unknown date'}
                  {issue.resolved_at && ` | Resolved on ${new Date(issue.resolved_at).toLocaleDateString()}`}
                </div>
                {issue.resolution && (
                  <div className="bg-green-50 p-3 rounded mt-2">
                    <p className="text-sm font-medium text-green-800">Resolution:</p>
                    <p className="text-sm text-green-700">{issue.resolution}</p>
                  </div>
                )}
                {issue.status === 'open' && canManage && (
                  <div className="mt-3">
                    <textarea 
                      placeholder="Enter resolution..."
                      className="w-full p-2 border rounded text-sm"
                      rows="2"
                      id={`resolution-${issue.id}`}
                    />
                    <button 
                      onClick={() => {
                        const resolution = document.getElementById(`resolution-${issue.id}`).value;
                        if (resolution) resolveIssue(project.id, issue.id, resolution);
                      }}
                      className="mt-2 px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 transition"
                    >
                      Mark as Resolved
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Updates */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-medium">Project Updates</h4>
            {isProjectApproved && actualWork.startDate && canManage && (
              <button 
                onClick={() => document.getElementById('add-update-modal').classList.remove('hidden')}
                className="bg-purple-500 text-white px-3 py-1 rounded text-sm hover:bg-purple-600 transition"
              >
                Add Update
              </button>
            )}
          </div>
          
          <div className="space-y-3">
            {(actualWork.updates || []).map(update => (
              <div key={update.id} className="border rounded-lg p-4 bg-gray-50">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium">{update.author}</span>
                  <span className="text-sm text-gray-500">{update.created_at ? new Date(update.created_at).toLocaleDateString() : 'Unknown date'}</span>
                </div>
                <p>{update.update_text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Discussion Section
  const DiscussionSection = ({ project }) => {
    return (
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Discussion</h3>
        </div>
        
        <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
          {(project.discussions || []).map(discussion => (
            <div key={discussion.id} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <div className="font-medium">{discussion.user_name || 'Unknown User'}</div>
                <div className="text-xs text-gray-500">
                  {discussion.created_at ? new Date(discussion.created_at).toLocaleString() : 'Unknown date'}
                </div>
              </div>
              <p className="text-gray-700">{discussion.comment}</p>
            </div>
          ))}
        </div>
        
        <div className="border-t pt-4">
          <textarea 
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="w-full p-3 border rounded-lg mb-3"
            rows="3"
          />
          <button 
            onClick={() => addComment(project.id)}
            disabled={!user}
            className={`px-4 py-2 rounded hover:bg-blue-600 transition ${
              user ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Post Comment
          </button>
        </div>
      </div>
    );
  };

  // Login Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="bg-blue-600 text-white p-3 rounded-lg inline-block mb-4">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">SI-Jari Proyek</h1>
            <p className="text-gray-500">Sistem Informasi Justifikasi Risiko Proyek</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* Login Form */}
            <div>
              <h2 className="text-xl font-semibold mb-4 text-center">Login</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input 
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your email"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input 
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your password"
                    required
                  />
                </div>
                
                <button 
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  Sign In
                </button>
              </form>
            </div>
            
            {/* Signup Form */}
            <div>
              <h2 className="text-xl font-semibold mb-4 text-center">Create Account</h2>
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input 
                    type="text"
                    value={signupData.name}
                    onChange={(e) => setSignupData({...signupData, name: e.target.value})}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your full name"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input 
                    type="email"
                    value={signupData.email}
                    onChange={(e) => setSignupData({...signupData, email: e.target.value})}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your email"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input 
                    type="password"
                    value={signupData.password}
                    onChange={(e) => setSignupData({...signupData, password: e.target.value})}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your password"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select 
                    value={signupData.role}
                    onChange={(e) => setSignupData({...signupData, role: e.target.value})}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {roles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select 
                    value={signupData.department}
                    onChange={(e) => setSignupData({...signupData, department: e.target.value})}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {departments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                
                <button 
                  type="submit"
                  className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-medium"
                >
                  Create Account
                </button>
              </form>
            </div>
          </div>
          
          <div className="mt-8 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800 text-center">
              Connected to Supabase: https://hjllwagynjjhifufvpvg.supabase.co
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <div className="bg-blue-600 text-white p-2 rounded-lg mr-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">SI-Jari Proyek</h1>
                <p className="text-sm text-gray-500">Sistem Informasi Justifikasi Risiko Proyek</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {user && (
                <>
                  <div className="text-right">
                    <p className="font-medium">{user.email}</p>
                    <p className="text-sm text-gray-500">User ID: {user.id}</p>
                  </div>
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                    {user.email.split('@')[0].charAt(0).toUpperCase()}
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Logout
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      {user && (
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex space-x-8">
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'dashboard' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Dashboard
              </button>
              <button 
                onClick={() => setActiveTab('submit')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'submit' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Submit Project
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'history' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                History & Archive
              </button>
            </div>
          </div>
        </nav>
      )}

      {/* Main Content */}
      {user && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === 'dashboard' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Project Dashboard</h2>
                <div className="flex space-x-2">
                  <select className="border rounded px-3 py-2">
                    <option>All Status</option>
                    <option>Pending Review</option>
                    <option>Approved</option>
                    <option>In Progress</option>
                    <option>Completed</option>
                    <option>Rejected</option>
                  </select>
                  <select className="border rounded px-3 py-2">
                    <option>All Departments</option>
                    {departments.map(dept => (
                      <option key={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="bg-blue-100 p-3 rounded-full">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Pending Review</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {projects.filter(p => getProjectStatus(p) === 'pending_review').length}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="bg-green-100 p-3 rounded-full">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Approved</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {projects.filter(p => getProjectStatus(p) === 'approved').length}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="bg-purple-100 p-3 rounded-full">
                      <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">In Progress</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {projects.filter(p => getProjectStatus(p) === 'in_progress').length}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="bg-gray-100 p-3 rounded-full">
                      <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Total Projects</p>
                      <p className="text-2xl font-semibold text-gray-900">{projects.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Current Projects</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Budget</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {projects.map(project => (
                        <tr key={project.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{project.title}</div>
                            <div className="text-sm text-gray-500">Submitted by {project.submitter}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{project.department}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${(project.budget || 0).toLocaleString()}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="w-24 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${project.actualWork?.progress || 0}%` }}
                              ></div>
                            </div>
                            <span className="text-xs text-gray-500">{project.actualWork?.progress || 0}%</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(getProjectStatus(project))}`}>
                              {getProjectStatus(project).replace('_', ' ')}
                            </span>
                            {project.actualWork?.startDate && (
                              <div className="text-xs text-gray-500 mt-1">
                                {project.actualWork?.endDate ? 'Completed' : 'In Progress'}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button 
                              onClick={() => setSelectedProject(project)}
                              className="text-blue-600 hover:text-blue-900 mr-3"
                            >
                              View Details
                            </button>
                            {canManageProject(project) && getProjectStatus(project) === 'pending_review' && (
                              <button className="text-gray-600 hover:text-gray-900">
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'submit' && (
            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Submit New Project</h2>
                
                <form onSubmit={handleProjectSubmission} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Project Title</label>
                    <input 
                      type="text" 
                      value={newProject.title}
                      onChange={(e) => setNewProject({...newProject, title: e.target.value})}
                      className="w-full p-3 border rounded-lg"
                      placeholder="Enter project title"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                    <select 
                      value={newProject.department}
                      onChange={(e) => setNewProject({...newProject, department: e.target.value})}
                      className="w-full p-3 border rounded-lg"
                      required
                    >
                      <option value="">Select Department</option>
                      {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Project Description</label>
                    <textarea 
                      value={newProject.description}
                      onChange={(e) => setNewProject({...newProject, description: e.target.value})}
                      className="w-full p-3 border rounded-lg"
                      rows="4"
                      placeholder="Describe your project, objectives, and expected outcomes"
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Budget ($)</label>
                      <input 
                        type="number" 
                        value={newProject.budget}
                        onChange={(e) => setNewProject({...newProject, budget: e.target.value})}
                        className="w-full p-3 border rounded-lg"
                        placeholder="0"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Timeline</label>
                      <input 
                        type="text" 
                        value={newProject.timeline}
                        onChange={(e) => setNewProject({...newProject, timeline: e.target.value})}
                        className="w-full p-3 border rounded-lg"
                        placeholder="e.g., 6 months"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-4 pt-4">
                    <button 
                      type="button"
                      onClick={() => setActiveTab('dashboard')}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
                    >
                      Submit Project
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Project History & Archive</h2>
              
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">All Projects</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final Status</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {projects.map(project => (
                        <tr key={project.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{project.title}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {project.created_at ? new Date(project.created_at).toLocaleDateString() : 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{project.department}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${project.actualWork?.progress || 0}%` }}
                              ></div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(getProjectStatus(project))}`}>
                              {getProjectStatus(project).replace('_', ' ')}
                            </span>
                            {project.actualWork?.endDate && (
                              <div className="text-xs text-gray-500 mt-1">Completed</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button 
                              onClick={() => setSelectedProject(project)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* Project Detail Modal */}
      {selectedProject && user && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold">{selectedProject.title}</h2>
              <button 
                onClick={() => setSelectedProject(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Description</h3>
                  <p className="mt-1 text-gray-900">{selectedProject.description}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Submitted By</h3>
                  <p className="mt-1 text-gray-900">{selectedProject.submitter}</p>
                  <p className="text-sm text-gray-500">Department: {selectedProject.department}</p>
                  <p className="text-sm text-gray-500">
                    Date: {selectedProject.created_at ? new Date(selectedProject.created_at).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Budget</h3>
                  <p className="mt-1 text-gray-900">${(selectedProject.budget || 0).toLocaleString()}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Timeline</h3>
                  <p className="mt-1 text-gray-900">{selectedProject.timeline}</p>
                </div>
              </div>

              <WorkflowVisualization project={selectedProject} />
              
              <RiskAnalysisSection 
                project={selectedProject} 
                isEditable={user && !canManageProject(selectedProject)}
              />
              
              <ActualWorkTracking project={selectedProject} />
              
              {/* Review Actions - Only show for reviewers */}
              {canReviewProject(selectedProject) && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-lg font-semibold mb-4">Your Review</h3>
                  <div className="space-y-4">
                    <textarea 
                      placeholder="Add your comments or feedback..."
                      className="w-full p-3 border rounded-lg"
                      rows="3"
                      id="review-comment"
                    />
                    <div className="flex space-x-4">
                      <button 
                        onClick={() => {
                          const comment = document.getElementById('review-comment').value;
                          handleReviewAction(selectedProject.id, 'approved', comment || 'Approved with no concerns');
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => {
                          const comment = document.getElementById('review-comment').value;
                          handleReviewAction(selectedProject.id, 'rejected', comment || 'Rejected due to concerns');
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
                      >
                        Reject
                      </button>
                      <button 
                        onClick={() => {
                          const comment = document.getElementById('review-comment').value;
                          handleReviewAction(selectedProject.id, 'needs_info', comment || 'Needs more information');
                        }}
                        className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition"
                      >
                        Request More Info
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Director Actions */}
              {user && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h3 className="text-lg font-semibold mb-4">Director Decision</h3>
                  <div className="space-y-4">
                    <textarea 
                      placeholder="Add your decision comments..."
                      className="w-full p-3 border rounded-lg"
                      rows="3"
                      id="director-comment"
                    />
                    <div className="flex space-x-4">
                      <button 
                        onClick={() => {
                          const comment = document.getElementById('director-comment').value;
                          handleDirectorAction(selectedProject.id, 'approved', comment || 'Project approved');
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
                      >
                        Approve Project
                      </button>
                      <button 
                        onClick={() => {
                          const comment = document.getElementById('director-comment').value;
                          handleDirectorAction(selectedProject.id, 'rejected', comment || 'Project rejected');
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
                      >
                        Reject Project
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              <DiscussionSection project={selectedProject} />
            </div>
          </div>
        </div>
      )}

      {/* Add Milestone Modal */}
      {user && (
        <div id="add-milestone-modal" className="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add New Milestone</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Milestone Name</label>
                <input 
                  type="text"
                  value={newMilestone.name}
                  onChange={(e) => setNewMilestone({...newMilestone, name: e.target.value})}
                  className="w-full p-2 border rounded"
                  placeholder="Enter milestone name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input 
                  type="date"
                  value={newMilestone.dueDate}
                  onChange={(e) => setNewMilestone({...newMilestone, dueDate: e.target.value})}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea 
                  value={newMilestone.description}
                  onChange={(e) => setNewMilestone({...newMilestone, description: e.target.value})}
                  className="w-full p-2 border rounded"
                  rows="3"
                  placeholder="Describe this milestone"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button 
                onClick={() => {
                  document.getElementById('add-milestone-modal').classList.add('hidden');
                  setNewMilestone({ name: '', dueDate: '', description: '' });
                }}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  addMilestone(selectedProject.id);
                  document.getElementById('add-milestone-modal').classList.add('hidden');
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add Milestone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Issue Modal */}
      {user && (
        <div id="add-issue-modal" className="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Report New Issue</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issue Description</label>
                <textarea 
                  value={newIssue.description}
                  onChange={(e) => setNewIssue({...newIssue, description: e.target.value})}
                  className="w-full p-2 border rounded"
                  rows="3"
                  placeholder="Describe the issue"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button 
                onClick={() => {
                  document.getElementById('add-issue-modal').classList.add('hidden');
                  setNewIssue({ description: '' });
                }}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  addIssue(selectedProject.id);
                  document.getElementById('add-issue-modal').classList.add('hidden');
                }}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Report Issue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Update Modal */}
      {user && (
        <div id="add-update-modal" className="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Project Update</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Update Description</label>
              <textarea 
                value={newUpdate}
                onChange={(e) => setNewUpdate(e.target.value)}
                className="w-full p-2 border rounded"
                rows="4"
                placeholder="Describe the latest update on the project"
              />
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button 
                onClick={() => {
                  document.getElementById('add-update-modal').classList.add('hidden');
                  setNewUpdate('');
                }}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  addUpdate(selectedProject.id);
                  document.getElementById('add-update-modal').classList.add('hidden');
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Post Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;