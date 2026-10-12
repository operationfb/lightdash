import { type FC, type PropsWithChildren } from 'react';
import { Navigate } from 'react-router';
import { useCanAccessSettings } from '../hooks/settings/useCanAccessSettings';

// KONTALA: to anyone but a superadmin, Settings answer like a route that does
// not exist, the same redirect the router's fallback route gives.
const SettingsRoute: FC<PropsWithChildren> = ({ children }) => {
    const canAccessSettings = useCanAccessSettings();
    if (!canAccessSettings) return <Navigate to="/projects" replace />;
    return <>{children}</>;
};

export default SettingsRoute;
